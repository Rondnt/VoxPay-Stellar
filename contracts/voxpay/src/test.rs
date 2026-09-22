#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _, token::StellarAssetClient, vec, Address, Env, String,
};

use crate::{Split, VoxPayContract, VoxPayContractClient};

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
