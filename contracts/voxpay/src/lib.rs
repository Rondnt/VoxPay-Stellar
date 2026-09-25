#![no_std]

use soroban_sdk::{contract, contractevent, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env, String, Vec};

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    Token,
    Operator(Address),
    Order(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum OrderStatus {
    Pending,
    Paid,
    Cancelled,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Split {
    pub recipient: Address,
    pub amount: i128,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Order {
    pub merchant: Address,
    pub amount: i128,
    pub splits: Vec<Split>,
    pub status: OrderStatus,
    pub created_at: u64,
}

#[contractevent(topics = ["order_created"])]
pub struct OrderCreated {
    #[topic]
    pub order_id: String,
    pub merchant: Address,
}

#[contractevent(topics = ["order_paid"])]
pub struct OrderPaid {
    #[topic]
    pub order_id: String,
    pub payer: Address,
    pub amount: i128,
}

#[contractevent(topics = ["order_cancelled"])]
pub struct OrderCancelled {
    #[topic]
    pub order_id: String,
    pub caller: Address,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotAuthorized = 2,
    OrderAlreadyExists = 3,
    OrderNotFound = 4,
    OrderNotPending = 5,
    InvalidAmount = 6,
    SplitsExceedAmount = 7,
}

#[contract]
pub struct VoxPayContract;

#[contractimpl]
impl VoxPayContract {
    /// Fija el token USDC (Stellar Asset Contract) que el contrato aceptará. Solo una vez.
    pub fn init(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// El comerciante autoriza al backend (operator) a crear órdenes en su nombre.
    pub fn set_operator(env: Env, merchant: Address, operator: Address) {
        merchant.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Operator(merchant), &operator);
    }

    /// El operator autorizado registra una orden en estado Pending.
    pub fn create_order(
        env: Env,
        operator: Address,
        merchant: Address,
        order_id: String,
        amount: i128,
        splits: Vec<Split>,
    ) {
        operator.require_auth();

        let authorized: Option<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Operator(merchant.clone()));
        if authorized != Some(operator) {
            panic_with_error!(env, Error::NotAuthorized);
        }

        if amount <= 0 {
            panic_with_error!(env, Error::InvalidAmount);
        }

        let splits_total: i128 = splits.iter().map(|s| s.amount).sum();
        if splits_total > amount {
            panic_with_error!(env, Error::SplitsExceedAmount);
        }

        let key = DataKey::Order(order_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(env, Error::OrderAlreadyExists);
        }

        let order = Order {
            merchant: merchant.clone(),
            amount,
            splits,
            status: OrderStatus::Pending,
            created_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&key, &order);

        OrderCreated { order_id, merchant }.publish(&env);
    }

    /// El cliente paga el monto exacto; el contrato reparte USDC y marca la orden como Paid.
    pub fn pay(env: Env, payer: Address, order_id: String) {
        payer.require_auth();

        let key = DataKey::Order(order_id.clone());
        let mut order: Order = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::OrderNotFound));

        if order.status != OrderStatus::Pending {
            panic_with_error!(env, Error::OrderNotPending);
        }

        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_address);

        let mut remaining = order.amount;
        for split in order.splits.iter() {
            token_client.transfer(&payer, &split.recipient, &split.amount);
            remaining -= split.amount;
        }
        token_client.transfer(&payer, &order.merchant, &remaining);

        order.status = OrderStatus::Paid;
        env.storage().persistent().set(&key, &order);

        OrderPaid { order_id, payer, amount: order.amount }.publish(&env);
    }

    /// El comerciante o su operator cancelan una orden que aún no fue pagada.
    pub fn cancel_order(env: Env, caller: Address, order_id: String) {
        caller.require_auth();

        let key = DataKey::Order(order_id.clone());
        let mut order: Order = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::OrderNotFound));

        let authorized_operator: Option<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Operator(order.merchant.clone()));
        let is_authorized = caller == order.merchant || Some(caller.clone()) == authorized_operator;
        if !is_authorized {
            panic_with_error!(env, Error::NotAuthorized);
        }

        if order.status != OrderStatus::Pending {
            panic_with_error!(env, Error::OrderNotPending);
        }

        order.status = OrderStatus::Cancelled;
        env.storage().persistent().set(&key, &order);

        OrderCancelled { order_id, caller }.publish(&env);
    }

    /// Lectura pública: monto, repartos y estado de una orden.
    pub fn get_order(env: Env, order_id: String) -> Order {
        env.storage()
            .persistent()
            .get(&DataKey::Order(order_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::OrderNotFound))
    }
}

mod test;
