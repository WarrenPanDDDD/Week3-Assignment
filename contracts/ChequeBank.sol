// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ChequeBank {

    struct ChequeInfo {
        uint amount;
        bytes32 chequeId;
        uint32 validFrom;
        uint32 validThru;
        address payee;
        address payer;
    }
    struct SignOverInfo {
        uint8 counter;
        bytes32 chequeId;
        address oldPayee;
        address newPayee;
    }

    struct Cheque {
        ChequeInfo chequeInfo;
        bytes sig;
    }
    struct SignOver {
        SignOverInfo signOverInfo;
        bytes sig;
    }

    mapping (address => uint) public userBalances;
    mapping (bytes32 => bool) public revokedCheques;
    mapping (bytes32 => bool) public redeemedCheques;
    mapping (bytes32 => address) public chequeIdToLatestPayer;
    mapping (bytes32 => address) public chequeIdToLatestPayee;

    event userDeposit(address depositer, uint amount);

    event userWithdraw(address withdrawer, uint amount);

    event userWithdrawTo(address withdrawFrom, address withdrawTo, uint amount);

    event userReemCheque(address redeemer, bytes32 chequeId, uint amount);

    event userNotifySignOver(address notifier, bytes32 chequeId, uint8 counter);

    event userRedeemSignOver(address notifier, bytes32 chequeId, uint amount);

    function deposit() payable external {
        userBalances[msg.sender] = userBalances[msg.sender] + msg.value;

        emit userDeposit(msg.sender, msg.value);
    }

    function withdraw(uint amount) external {
        require(userBalances[msg.sender] >= amount, "user balance is not enough" );

        userBalances[msg.sender] = userBalances[msg.sender] - amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "withdraw transfer failed.");

        emit userWithdraw(msg.sender, amount);
    }

    function withdrawTo(uint amount, address payable recipient) external {
        require(userBalances[msg.sender] >= amount, "user balance is not enough" );

        userBalances[msg.sender] = userBalances[msg.sender] - amount;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "withdraw transfer failed.");

        emit userWithdrawTo(msg.sender, recipient, amount);
    }

    function redeem(Cheque memory chequeData) external {
        // filter calls of signed-over cheque
        require(chequeIdToLatestPayer[chequeData.chequeInfo.chequeId] == address(0), "please call redeemSignOver() if this cheque has been signed over");

        bool ifChequeValid = isChequeValid(msg.sender, chequeData, new SignOver[](0));
        require(ifChequeValid == true, "this check is not valid");

        require(userBalances[chequeData.chequeInfo.payer] >= chequeData.chequeInfo.amount, "payer balance is not enough");

        userBalances[chequeData.chequeInfo.payer] = userBalances[chequeData.chequeInfo.payer] - chequeData.chequeInfo.amount;
        (bool success, ) = chequeData.chequeInfo.payee.call{value: chequeData.chequeInfo.amount}("");
        require(success, "redeem failed.");

        redeemedCheques[chequeData.chequeInfo.chequeId] = true;

        emit userReemCheque(msg.sender, chequeData.chequeInfo.chequeId, chequeData.chequeInfo.amount);
    }

    function revoke(Cheque memory chequeData) external {
        require(revokedCheques[chequeData.chequeInfo.chequeId] == false, "the cheque is revoked");

        if (chequeIdToLatestPayer[chequeData.chequeInfo.chequeId] == address(0)) {
            // if this cheque hasn't been signed over
            require(msg.sender == chequeData.chequeInfo.payer, "only payer can revoke a check");

            bool ifChequeValid = isChequeValid(chequeData.chequeInfo.payee, chequeData, new SignOver[](0));

            require(ifChequeValid == true, "this cheque is not valid");
        } else {
            // if this cheque has been signed over
            // we dont have to do the check isChequeValid() here because we have done the check in notifySignOver()
            require(msg.sender == chequeIdToLatestPayer[chequeData.chequeInfo.chequeId], "have no right to revoke this cheque");
        }

        revokedCheques[chequeData.chequeInfo.chequeId] = true;
    }

    // To prevent malicious notify, i think it will be better to pass the whole signOverData histroy and the chequeData
    function notifySignOver(SignOver[] memory signOverData, Cheque memory chequeData) external {
        isChequeValid(msg.sender, chequeData, signOverData);

        // get the latest signOverData
        uint largestCounter = 0;
        SignOver memory latestSignOver = signOverData[0];
        for (uint i = 0; i < signOverData.length; i++) {
            if (signOverData[i].signOverInfo.counter > largestCounter) {
                largestCounter = signOverData[i].signOverInfo.counter;
                latestSignOver = signOverData[i];
            }
        }

        chequeIdToLatestPayer[latestSignOver.signOverInfo.chequeId] = latestSignOver.signOverInfo.oldPayee;
        chequeIdToLatestPayee[latestSignOver.signOverInfo.chequeId] = latestSignOver.signOverInfo.newPayee;

        emit userNotifySignOver(msg.sender, latestSignOver.signOverInfo.chequeId, latestSignOver.signOverInfo.counter);
    }

    function redeemSignOver(
        Cheque memory chequeData,
        SignOver[] memory signOverData
    ) external {
        isChequeValid(msg.sender, chequeData, signOverData);

        require(userBalances[chequeData.chequeInfo.payer] >= chequeData.chequeInfo.amount, "payer balance is not enough");

        userBalances[chequeData.chequeInfo.payer] = userBalances[chequeData.chequeInfo.payer] - chequeData.chequeInfo.amount;
        (bool success, ) = msg.sender.call{value: chequeData.chequeInfo.amount}("");
        require(success, "redeem failed.");

        emit userRedeemSignOver(msg.sender, chequeData.chequeInfo.chequeId, chequeData.chequeInfo.amount);
    }

    function isChequeValid(
        address payee,
        Cheque memory chequeData,
        SignOver[] memory signOverData
    ) public view returns (bool) {
        // if cheque is redeemed
        require(redeemedCheques[chequeData.chequeInfo.chequeId] == false, "cheque is redeemed");

        // if cheque is revoked
        require(revokedCheques[chequeData.chequeInfo.chequeId] == false, "cheque is revoked");

        // check validFrom
        if (chequeData.chequeInfo.validFrom != 0 && block.number < chequeData.chequeInfo.validFrom) {
            revert("cheque is not activated yet");
        }

        // check validThru
        if (chequeData.chequeInfo.validThru != 0 && block.number > chequeData.chequeInfo.validThru) {
            revert("cheque is expired");
        }

        bytes32 message = prefixed(keccak256(abi.encodePacked(
                chequeData.chequeInfo.chequeId,
                chequeData.chequeInfo.payer,
                chequeData.chequeInfo.payee,
                chequeData.chequeInfo.amount,
                address(this),
                chequeData.chequeInfo.validFrom,
                chequeData.chequeInfo.validThru)));

        // if the signature of cheque matches
        require(recoverSigner(message, chequeData.sig) == chequeData.chequeInfo.payer, "cheque signature unmatched");

        // check the if the signOvers are valid
        require(signOverData.length <= 6, "at most 6 signOvers for a cheque");

        uint counter = 0;
        address currentPayer = chequeData.chequeInfo.payer;
        address currentPayee = chequeData.chequeInfo.payee;
        for(uint index = 0; index < signOverData.length; index++) {
            counter++;

            SignOver memory targetSignOver = SignOver(SignOverInfo(0, "", address(0), address(0)), "");
            // in case the signOvers is not sorted by counter, add a for loop to find the target signOver
            for(uint j = 0; j < signOverData.length; j++) {
                if (signOverData[j].signOverInfo.counter == counter) {
                    targetSignOver = signOverData[j];
                    break;
                }
            }
            // raise error if counter is not continuously
            require(targetSignOver.signOverInfo.counter == counter, "signOver counter invalid");

            // check if the signOver is valid
            checkIfSignOverValid(targetSignOver, chequeData.chequeInfo.chequeId, currentPayee);

            currentPayer = targetSignOver.signOverInfo.oldPayee;
            currentPayee = targetSignOver.signOverInfo.newPayee;
        }

        // verify the final payee
        require(currentPayee == payee, "payee doesnt match");

        return true;
    }

    function checkIfSignOverValid(SignOver memory signOver, bytes32 chequeId, address lastChequePayer) internal view {
        require(signOver.signOverInfo.counter <= 6, "at most signOver");

        require(signOver.signOverInfo.chequeId == chequeId, "signOver chequeId doesnt match");
        require(signOver.signOverInfo.oldPayee == lastChequePayer, "signOver oldPayee doesnt match");

        bytes4 magicNumber = 0xFFFFDEAD;
        bytes32 message = prefixed(keccak256(abi.encodePacked(
                magicNumber,
                signOver.signOverInfo.counter,
                signOver.signOverInfo.chequeId,
                signOver.signOverInfo.oldPayee,
                signOver.signOverInfo.newPayee)));

        // if the signature of cheque matches
        require(recoverSigner(message, signOver.sig) == signOver.signOverInfo.oldPayee, "sign over signature unmatched");
    }

    function splitSignature(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65);

        assembly {
        // first 32 bytes, after the length prefix.
            r := mload(add(sig, 32))
        // second 32 bytes.
            s := mload(add(sig, 64))
        // final byte (first byte of the next 32 bytes).
            v := byte(0, mload(add(sig, 96)))
        }

        return (v, r, s);
    }

    function recoverSigner(bytes32 message, bytes memory sig) internal pure returns (address) {
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(sig);

        return ecrecover(message, v, r, s);
    }

    /// builds a prefixed hash to mimic the behavior of eth_sign.
    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

}