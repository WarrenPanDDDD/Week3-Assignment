# Week 3 Assignments

Cronos dapp engineer training week3 tasks: FruitStand and E-cheque.

## FruitStand
Optimizations I made or consider to make:
1. Record fibonacci number into storage with a mapping instead of calculating it every time. A maaping is declared as:
```
mapping (uint => uint) fibResult;
```
Every time we need the fibonacci numebr of n, we check _fibResult_ first, if it exist in _fibResult_, we can read it from storage instead of calculate it again; If it doesn't exist in _fibResult_, we calculate the fibonacci numebr and store it into _fibResult_, so next time we can read it directly from storage.

This can save gas of _payout()_ function.

2. I found a bug in the stake logic. Currently when a user stake, we check if this user already has a staking by checking 
```
userStakes[msg.sender].startBlock != 0
```
Then we payout the $MELON rewards by calling _payout()_. This is correct so far.

But after that we store a new _UserStake_ with the new _stakeAmount_, without unstake the previous staking or add the previous staking $WATER to the new _UserStake_. Hence, user's previous staked $WATER is MISSING.

My solution is, we should add the previous stakeAmount to the new stakeAmount
```
UserStake memory newStake = UserStake({ startBlock: block.number, stakeAmount: _amount + previousWaterStaked });
userStakes[msg.sender] = newStake;
```
Which means that user get the $MELON rewards with previous stake, and he want to use the previously staked $WATER and the new $WATER to start a new staking.

3. We can consider shorten the log messages to save gas.

4. We can consider simplify the calculation of fibonacci number using _fibResult_ mapping we defined in (1). But this will make _fib()_ no longer a view function. 

## ChequeBank
Finish base functions and optional functions. 
Have unit tests. 
Change some interfaces.
### interfaces
1. deposit.
User can deposit Ether to this contract. Will add it to user's balances.
```
function deposit() payable external {}
```
2. withdraw.
User can withdraw his ether from contract to his address that is calling this function.
```
function withdraw(uint amount) external {}
```
3. withdrawTo.
User can withdraw his ether from contract to a specific address.
```
function withdrawTo(uint amount, address payable recipient) external {}
```
4. redeem.
User can redeem a cheque. Notice that I assume this function can only be called to redeem a cheque that hasn't been signed over. If a cheque is signed-over, user should call redeemSignOver() instead.
```
function redeem(Cheque memory chequeData) external {}
```

5. revoke. 
* If a cheque hasn't been signed over, the cheque payer can revoke this cheque. If a cheque has been signed-over and notified, the last 'oldPayee' can revoke the cheque.
* Notice that I also change the param from _'bytes32_ _chequeId'_ to _'Cheque_ _memory_ _chequeData'_, so I can make use of the payer address in _chequeData_.
* There is a possible vulnerability that if a attacker knows a chequeId, he can make a valid cheque with this chequeId, and call revoke(). Then this chequeId is marked as 'revoked' in contract. So when the real cheque with the same chequeId comes to redeem, the redeem will failed because of the chequeId has already revoked.

```
function revoke(Cheque memory chequeData) external {}
```

6. notifySignOver. 
* A user can notify a signOver to the contract. After notify, he have the right to redeem signOver, and the oldPayee of this sign over has right to revoke this cheque.
* I change the interface param. _chequeData_ is added, and the full history of SignOver[] is provided instead of only the latest signOver. I do this to prevent malicious notify to the contract.
```
function notifySignOver(SignOver[] memory signOverData, Cheque memory chequeData) external {}
```

7. redeemSignOver. The newPayee of the signOver can redeem a signOver after he notify the contract.
```
function redeemSignOver(Cheque memory chequeData, SignOver[] memory signOverData) external {
```

### events
```
event userDeposit(address depositer, uint amount);

event userWithdraw(address withdrawer, uint amount);

event userWithdrawTo(address withdrawFrom, address withdrawTo, uint amount);

event userRedeemCheque(address redeemer, bytes32 chequeId, uint amount);

event userNotifySignOver(address notifier, bytes32 chequeId, uint8 counter);

event userRedeemSignOver(address notifier, bytes32 chequeId, uint amount);
```
