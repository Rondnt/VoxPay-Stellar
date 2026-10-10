#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _, token::StellarAssetClient, vec, Address, Env, String,
};

use crate::{Error, Split, VoxPayContract, VoxPayContractClient};

// `try_*` en el cliente generado devuelve el error como `soroban_sdk::Error` (tipo host, borrado),
// no como nuestro enum `Error` directo -- hay que reconstruirlo desde el código numérico para poder
// comparar contra la variante esperada.
fn contract_error(e: Error) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}

fn setup<'a>() -> (Env, VoxPayContractClient<'a>, StellarAssetClient<'a>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin);
    let token = StellarAssetClient::new(&env, &token_contract.address());

    let contract_id = env.register(VoxPayContract, ());
    let client = VoxPayContractClient::new(&env, &contract_id);
    client.init(&admin, &token_contract.address());

    (env, client, token, admin)
}

#[test]
fn create_and_pay_order_splits_funds() {
    let (env, client, token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let payer = Address::generate(&env);

    token.mint(&payer, &1_000);

    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "52");
    let splits = vec![
        &env,
        Split {
            recipient: recipient.clone(),
            amount: 3,
        },
    ];
    client.create_order(&operator, &merchant, &order_id, &30, &splits);

    let order = client.get_order(&order_id);
    assert_eq!(order.amount, 30);
    assert_eq!(order.status, crate::OrderStatus::Pending);

    client.pay(&payer, &order_id);

    let order = client.get_order(&order_id);
    assert_eq!(order.status, crate::OrderStatus::Paid);

    assert_eq!(token.balance(&recipient) as i128, 3);
    assert_eq!(token.balance(&merchant) as i128, 27);
    assert_eq!(token.balance(&payer) as i128, 970);
}

#[test]
fn cancel_order_marks_cancelled() {
    let (env, client, _token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);

    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "53");
    client.create_order(&operator, &merchant, &order_id, &10, &vec![&env]);

    client.cancel_order(&merchant, &order_id);

    let order = client.get_order(&order_id);
    assert_eq!(order.status, crate::OrderStatus::Cancelled);
}

#[test]
fn create_order_splits_to_multiple_recipients() {
    let (env, client, token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    let recipient_a = Address::generate(&env);
    let recipient_b = Address::generate(&env);
    let payer = Address::generate(&env);

    token.mint(&payer, &1_000);
    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "100");
    let splits = vec![
        &env,
        Split {
            recipient: recipient_a.clone(),
            amount: 4,
        },
        Split {
            recipient: recipient_b.clone(),
            amount: 6,
        },
    ];
    client.create_order(&operator, &merchant, &order_id, &30, &splits);
    client.pay(&payer, &order_id);

    assert_eq!(token.balance(&recipient_a) as i128, 4);
    assert_eq!(token.balance(&recipient_b) as i128, 6);
    assert_eq!(token.balance(&merchant) as i128, 20);
    assert_eq!(token.balance(&payer) as i128, 970);
    assert_eq!(client.get_order(&order_id).status, crate::OrderStatus::Paid);
}

#[test]
fn init_rejects_second_call() {
    let (env, client, _token, admin) = setup();

    let other_token = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let result = client.try_init(&admin, &other_token.address());
    assert_eq!(result, Err(Ok(contract_error(Error::AlreadyInitialized))));
}

#[test]
fn create_order_rejects_unauthorized_operator() {
    let (env, client, _token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    let impostor = Address::generate(&env);
    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "101");
    let result = client.try_create_order(&impostor, &merchant, &order_id, &10, &vec![&env]);
    assert_eq!(result, Err(Ok(contract_error(Error::NotAuthorized))));
}

#[test]
fn create_order_rejects_non_positive_amount() {
    let (env, client, _token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "102");
    let result = client.try_create_order(&operator, &merchant, &order_id, &0, &vec![&env]);
    assert_eq!(result, Err(Ok(contract_error(Error::InvalidAmount))));
}

#[test]
fn create_order_rejects_splits_over_amount() {
    let (env, client, _token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    let recipient = Address::generate(&env);
    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "103");
    let splits = vec![
        &env,
        Split {
            recipient,
            amount: 50,
        },
    ];
    let result = client.try_create_order(&operator, &merchant, &order_id, &30, &splits);
    assert_eq!(result, Err(Ok(contract_error(Error::SplitsExceedAmount))));
}

#[test]
fn create_order_rejects_duplicate_id() {
    let (env, client, _token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "104");
    client.create_order(&operator, &merchant, &order_id, &10, &vec![&env]);

    let result = client.try_create_order(&operator, &merchant, &order_id, &10, &vec![&env]);
    assert_eq!(result, Err(Ok(contract_error(Error::OrderAlreadyExists))));
}

#[test]
fn pay_rejects_unknown_order() {
    let (env, client, _token, _admin) = setup();

    let payer = Address::generate(&env);
    let order_id = String::from_str(&env, "999");
    let result = client.try_pay(&payer, &order_id);
    assert_eq!(result, Err(Ok(contract_error(Error::OrderNotFound))));
}

#[test]
fn pay_rejects_already_paid_order() {
    let (env, client, token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    let payer = Address::generate(&env);
    token.mint(&payer, &1_000);
    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "105");
    client.create_order(&operator, &merchant, &order_id, &10, &vec![&env]);
    client.pay(&payer, &order_id);

    let result = client.try_pay(&payer, &order_id);
    assert_eq!(result, Err(Ok(contract_error(Error::OrderNotPending))));
}

#[test]
fn cancel_order_rejects_unknown_order() {
    let (env, client, _token, _admin) = setup();

    let caller = Address::generate(&env);
    let order_id = String::from_str(&env, "998");
    let result = client.try_cancel_order(&caller, &order_id);
    assert_eq!(result, Err(Ok(contract_error(Error::OrderNotFound))));
}

#[test]
fn cancel_order_rejects_unauthorized_caller() {
    let (env, client, _token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    let stranger = Address::generate(&env);
    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "106");
    client.create_order(&operator, &merchant, &order_id, &10, &vec![&env]);

    let result = client.try_cancel_order(&stranger, &order_id);
    assert_eq!(result, Err(Ok(contract_error(Error::NotAuthorized))));
}

#[test]
fn cancel_order_rejects_already_paid_order() {
    let (env, client, token, _admin) = setup();

    let merchant = Address::generate(&env);
    let operator = Address::generate(&env);
    let payer = Address::generate(&env);
    token.mint(&payer, &1_000);
    client.set_operator(&merchant, &operator);

    let order_id = String::from_str(&env, "107");
    client.create_order(&operator, &merchant, &order_id, &10, &vec![&env]);
    client.pay(&payer, &order_id);

    let result = client.try_cancel_order(&merchant, &order_id);
    assert_eq!(result, Err(Ok(contract_error(Error::OrderNotPending))));
}

#[test]
fn get_order_rejects_unknown_order() {
    let (env, client, _token, _admin) = setup();

    let order_id = String::from_str(&env, "997");
    let result = client.try_get_order(&order_id);
    assert_eq!(result, Err(Ok(contract_error(Error::OrderNotFound))));
}
