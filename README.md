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
