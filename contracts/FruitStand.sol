// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FruitStand {

    struct UserStake {
        uint startBlock;
        uint stakeAmount;
    }

    ERC20 water;
    ERC20 melon;
    mapping (address => UserStake) userStakes;
    mapping (uint => uint) fibResult;

    constructor(address _water, address _melon) {
        water = ERC20(_water);
        melon = ERC20(_melon);
    }

    function stake(uint _amount) external {
        require(_amount > 0, "FruitStand: Stake amount must be greater than zero");

        // I think in the case of user stake twice without doing unStake, we need to add up the stakeAmount. Only payout
        // the previous bonus is not enough
        uint previousWaterStaked = 0;
        if (userStakes[msg.sender].startBlock != 0) {
            // Pay out current stake
            payout(msg.sender, userStakes[msg.sender]);
            previousWaterStaked = userStakes[msg.sender].stakeAmount;
        }
        water.transferFrom(msg.sender, address(this), _amount);
        // start a new stake, if there are previous staked $Water, add them up to new stakeAmount
        UserStake memory newStake = UserStake({ startBlock: block.number, stakeAmount: _amount + previousWaterStaked });
        userStakes[msg.sender] = newStake;
    }

    function unstake() external {
        require(userStakes[msg.sender].startBlock != 0, "FruitStand: User have not staked");
        payout(msg.sender, userStakes[msg.sender]);
        water.transfer(msg.sender, userStakes[msg.sender].stakeAmount);
        userStakes[msg.sender] = UserStake({ startBlock: 0, stakeAmount: 0 });
    }

    function payout(address user, UserStake memory stake) internal returns (uint8 errCode) {
        uint blockDelta = block.number - stake.startBlock;
        if (blockDelta > 300) {
            blockDelta = 300;
        }

        // get fib number
        if (fibResult[blockDelta] == 0) {
            fibResult[blockDelta] = fib(blockDelta);
        }

        uint multiplier = fibResult[blockDelta];
        uint rewardAmount = multiplier * stake.stakeAmount;
        melon.transfer(user, rewardAmount);
        return 0;
    }

    function fib(uint n) public view returns (uint fn) {
        if (n == 0) {
            return 0;
        }
        else if (n == 1) {
            return 1;
        }
        else if (n > 1) {
            return fib(n-2) + fib(n-1);
        }
    }

}