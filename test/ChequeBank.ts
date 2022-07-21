import {expect} from "chai";
import hre, {ethers} from "hardhat";
import { ChequeBank } from "../typechain-types";


describe("ChequeBank", function () {
    async function signCheque(chequeId: any, payer: string, payee: string, amount: any,
        contractAddress: string, validFrom: number, validThru: number, signer: any) {
        let chequeDataHash = ethers.utils.solidityKeccak256(
            ["bytes32", "address", "address", "uint", "address", "uint32", "uint32"],
            [
                chequeId,
                payer,
                payee,
                amount,
                contractAddress,
                validFrom,
                validThru
            ]);

        let chequeDataHashBytes = ethers.utils.arrayify(chequeDataHash);
        let signature = await signer.signMessage(chequeDataHashBytes);

        return signature;
    }

    async function deployContract() {
        const [signer] = await ethers.getSigners();
        const ChequeBank = await ethers.getContractFactory("ChequeBank");
        const chequeBank = await ChequeBank.deploy();
        return {chequeBank, signer};
    }

    function getRandomInt(max : number) {
        return Math.floor(Math.random() * max);
    }

    async function createCheque(payer : any, payee : any, contractAddress : any, signer : any) {
        let chequeId = ethers.utils.formatBytes32String(getRandomInt(100000000).toString());
        let amount = ethers.utils.parseEther("1").toBigInt();
        // mine 256 blocks
        await hre.network.provider.send("hardhat_mine", ["0x100"]);
        let currentBlockNumber = await ethers.provider.getBlockNumber();
        let validFrom = currentBlockNumber - 100;
        let validThru = currentBlockNumber + 100;
        let sig = await signCheque(chequeId, payer, payee, amount, contractAddress, validFrom, validThru, signer);
        let chequeInfo = {
            chequeId,
            payer,
            payee,
            amount,
            validFrom,
            validThru
        };
        let chequeData = {
            chequeInfo,
            sig
        };

        return chequeData;
    }

    async function createSignOver(counter : number, chequeId : any, oldPayee : string, newPayee : string, signer : any) {
        let sig = await signSignOver(counter, chequeId, oldPayee, newPayee, signer);
        let signOverInfo = {
            counter,
            chequeId,
            oldPayee,
            newPayee
        }
        let signOverData = {
            signOverInfo,
            sig
        }

        return signOverData;
    }

    async function signSignOver(counter : number, chequeId : any, oldPayee : string, newPayee : string, signer : any) {
        let magicNumber = 0xFFFFDEAD;
        let signOverDataHash = ethers.utils.solidityKeccak256(
            ["bytes4", "uint8", "bytes32", "address", "address"],
            [
                magicNumber,
                counter,
                chequeId,
                oldPayee,
                newPayee
            ]);

        let signOverDataHashBytes = ethers.utils.arrayify(signOverDataHash);
        let signature = await signer.signMessage(signOverDataHashBytes);

        return signature;
    }

    describe("test Deposit()", async function() {
        it("deposit success", async function () {
            const {chequeBank, signer} = await deployContract();
            const [, address1] = await ethers.getSigners();

            await expect(chequeBank.connect(address1).deposit({value : ethers.utils.parseEther("1")})).to.changeEtherBalances(
                [address1],
                [-ethers.utils.parseEther("1").toBigInt()]
            );
            expect(await chequeBank.userBalances(address1.address)).to.equal(ethers.utils.parseEther("1"));
        });
    });

    describe("test Withdraw()", async function() {
        it("withdraw success", async function () {
            const {chequeBank, signer} = await deployContract();
            const [, address1] = await ethers.getSigners();

            // deposit 5 Ether
            await chequeBank.connect(address1).deposit({value : ethers.utils.parseEther("5")});

            // Withdraw 1 Ether
            await expect(chequeBank.connect(address1).withdraw(ethers.utils.parseEther("1"))).to.changeEtherBalances(
                [address1],
                [ethers.utils.parseEther("1").toBigInt()]
            );

            expect(await chequeBank.userBalances(address1.address)).to.equal(ethers.utils.parseEther("4"));
        });

        it("withdraw failed not enough balance", async function () {
            const {chequeBank, signer} = await deployContract();
            const [, address1] = await ethers.getSigners();

            // deposit 1 Ether
            await chequeBank.connect(address1).deposit({value : ethers.utils.parseEther("1")});

            // Withdraw 2 Ether
            await expect(chequeBank.connect(address1).withdraw(ethers.utils.parseEther("2"))).to.be.revertedWith("user balance is not enough");
        });
    });

    describe("test WithdrawTo()", async function() {
        it("withdraw to success", async function () {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 5 Ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("5")});

            // Withdraw 1 Ether
            await expect(chequeBank.connect(address1).withdrawTo(ethers.utils.parseEther("1"), address2.address)).to
                .changeEtherBalances(
                    [address2],
                    [ethers.utils.parseEther("1").toBigInt()]
                );

            expect(await chequeBank.userBalances(address1.address)).to.equal(ethers.utils.parseEther("4"));
        });
    });

    describe("test Redeem()", async function() {
        it("cheque has no signOvers, redeem success", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // redeem cheque success
            await expect(chequeBank.connect(address2).redeem(chequeData)).to
                .changeEtherBalances(
                    [address2],
                    [ethers.utils.parseEther("1").toBigInt()]
                );

            expect(await chequeBank.userBalances(address1.address)).to.equal(ethers.utils.parseEther("2"));
            expect(await chequeBank.redeemedCheques(chequeData.chequeInfo.chequeId)).to.equal(true);
        });

        it("cheque has no signOvers, failed because cheque is already redeemed", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // redeem cheque success
            await expect(chequeBank.connect(address2).redeem(chequeData)).to
                .changeEtherBalances(
                    [address2],
                    [ethers.utils.parseEther("1").toBigInt()]
                );

            // redeem cheque again failed
            await expect(chequeBank.connect(address1).redeem(chequeData)).to.be.revertedWith("cheque is redeemed");
        });

        it("cheque has no signOvers, failed because cheque is already revoked", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            await chequeBank.connect(address1).revoke(chequeData);

            expect(await chequeBank.revokedCheques(chequeData.chequeInfo.chequeId)).to.be.equal(true);

            await expect(chequeBank.connect(address2).redeem(chequeData)).to.be.revertedWith("cheque is revoked");
        });

        it("cheque has no signOvers, failed because cheque is not activated yet", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeId = ethers.utils.formatBytes32String(getRandomInt(100000000).toString());
            let payer = address1.address;
            let payee = address2.address;
            let amount = ethers.utils.parseEther("1").toBigInt();
            let contractAddress = chequeBank.address;
            // mine 256 blocks
            await hre.network.provider.send("hardhat_mine", ["0x100"]);
            let currentBlockNumber = await ethers.provider.getBlockNumber();
            let validFrom = currentBlockNumber + 100;
            let validThru = currentBlockNumber + 200;
            let sig = await signCheque(chequeId, payer, payee, amount, contractAddress, validFrom, validThru, address1);
            let chequeInfo = {
                chequeId,
                payer,
                payee,
                amount,
                validFrom,
                validThru
            };
            let chequeData = {
                chequeInfo,
                sig
            };

            // redeem cheque failed
            await expect(chequeBank.connect(address1).redeem(chequeData)).to.be.revertedWith("cheque is not activated yet");
        });

        it("cheque has no signOvers, failed because cheque is expired", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeId = ethers.utils.formatBytes32String(getRandomInt(100000000).toString());
            let payer = address1.address;
            let payee = address2.address;
            let amount = ethers.utils.parseEther("1").toBigInt();
            let contractAddress = chequeBank.address;
            // mine 256 blocks
            await hre.network.provider.send("hardhat_mine", ["0x100"]);
            let currentBlockNumber = await ethers.provider.getBlockNumber();
            let validFrom = currentBlockNumber - 200;
            let validThru = currentBlockNumber - 100;
            let sig = await signCheque(chequeId, payer, payee, amount, contractAddress, validFrom, validThru, address1);
            let chequeInfo = {
                chequeId,
                payer,
                payee,
                amount,
                validFrom,
                validThru
            };
            let chequeData = {
                chequeInfo,
                sig
            };

            // redeem cheque failed
            await expect(chequeBank.connect(address1).redeem(chequeData)).to.be.revertedWith("cheque is expired");
        });

        it("cheque has no signOvers, failed because signature unmatched", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeId = ethers.utils.formatBytes32String(getRandomInt(100000000).toString());
            let payer = address1.address;
            let payee = address2.address;
            let amount = ethers.utils.parseEther("1").toBigInt();
            let contractAddress = chequeBank.address;
            // mine 256 blocks
            await hre.network.provider.send("hardhat_mine", ["0x100"]);
            let currentBlockNumber = await ethers.provider.getBlockNumber();
            let validFrom = currentBlockNumber - 100;
            let validThru = currentBlockNumber + 100;

            // signed by incorrect signer
            let sig = await signCheque(chequeId, payer, payee, amount, contractAddress, validFrom, validThru, address2);
            let chequeInfo = {
                chequeId,
                payer,
                payee,
                amount,
                validFrom,
                validThru
            };
            let chequeData = {
                chequeInfo,
                sig
            };

            // redeem cheque failed
            await expect(chequeBank.connect(address1).redeem(chequeData)).to.be.revertedWith("cheque signature unmatched");
        });

        it("cheque has signOvers, reject", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                1, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await chequeBank.connect(address3).notifySignOver([signOverData], chequeData);

            await expect(chequeBank.connect(address3).redeem(chequeData)).to.be.revertedWith("please call redeemSignOver() if this cheque has been signed over");
        });
    });

    describe("test revoke()", async function() {
        it("cheque has no signOvers, revoke success", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            await chequeBank.connect(address1).revoke(chequeData);

            expect(await chequeBank.revokedCheques(chequeData.chequeInfo.chequeId)).to.be.equal(true);
        });

        it("cheque has no signOvers, revoke failed because it is already revoked", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            expect(await chequeBank.revokedCheques(chequeData.chequeInfo.chequeId)).to.be.equal(false);

            // revoke
            await chequeBank.connect(address1).revoke(chequeData);

            expect(await chequeBank.revokedCheques(chequeData.chequeInfo.chequeId)).to.be.equal(true);

            // revoke again
            await expect(chequeBank.connect(address1).revoke(chequeData)).to.be.revertedWith("the cheque is revoked");


        });

        it("cheque has no signOvers, revoke failed because it is not called by cheque owner", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // revoke
            await expect( chequeBank.connect(address2).revoke(chequeData)).to.be.revertedWith("only payer can revoke a check");


        });

        it("cheque has signOvers, revoke success", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3] = await ethers.getSigners();


            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                1, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await chequeBank.connect(address3).notifySignOver([signOverData], chequeData);

            await chequeBank.connect(address2).revoke(chequeData);

            expect(await chequeBank.revokedCheques(chequeData.chequeInfo.chequeId)).to.be.equal(true);
        });

        it("cheque has signOvers, revoke failed because caller has no right to revoke", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3] = await ethers.getSigners();

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                1, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await chequeBank.connect(address3).notifySignOver([signOverData], chequeData);

            await expect(chequeBank.connect(address3).revoke(chequeData)).to.be.revertedWith("have no right to revoke this cheque");
        });
    });

    describe("test notifySignOver()", async function() {

        it("notifySignOver success", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3, address4] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                1, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await chequeBank.connect(address3).notifySignOver([signOverData], chequeData);

            expect(await chequeBank.chequeIdToLatestPayer(chequeData.chequeInfo.chequeId)).to.be.equal(address2.address);
            expect(await chequeBank.chequeIdToLatestPayee(chequeData.chequeInfo.chequeId)).to.be.equal(address3.address);

            // create another signOver
            let signOverData2 = await createSignOver(
                2, chequeData.chequeInfo.chequeId, address3.address, address4.address, address3);

            await chequeBank.connect(address4).notifySignOver([signOverData, signOverData2], chequeData);

            expect(await chequeBank.chequeIdToLatestPayer(chequeData.chequeInfo.chequeId)).to.be.equal(address3.address);
            expect(await chequeBank.chequeIdToLatestPayee(chequeData.chequeInfo.chequeId)).to.be.equal(address4.address);
        });

        it("notifySignOver failed, signOver array length exceed limit 6", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                1, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await expect(
                chequeBank.connect(address3).notifySignOver(
                    [signOverData, signOverData, signOverData, signOverData, signOverData, signOverData, signOverData],
                    chequeData)).to.be.revertedWith("at most 6 signOvers for a cheque");
        });

        it("notifySignOver failed, signOver counter invalid", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                2, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await expect(
                chequeBank.connect(address3)
                    .notifySignOver([signOverData], chequeData)).to.be.revertedWith("signOver counter invalid");
        });

        it("notifySignOver failed, msg.sender doesnt match the final payee", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3, address4] = await ethers.getSigners();

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                1, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await expect(
                chequeBank.connect(address4)
                    .notifySignOver([signOverData], chequeData)).to.be.revertedWith("payee doesnt match");
        });

    });

    describe("test redeemSignOver()", async function() {
        it("redeem signOver success", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3] = await ethers.getSigners();

            // deposit 3 ether
            await chequeBank.connect(address1).deposit({value: ethers.utils.parseEther("3")});

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                1, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await chequeBank.connect(address3).notifySignOver([signOverData], chequeData);

            // redeem sign over success
            await expect(chequeBank.connect(address3).redeemSignOver(chequeData, [signOverData])).to
                .changeEtherBalances(
                    [address3],
                    [ethers.utils.parseEther("1").toBigInt()]
                );
        });

        it("redeem signOver failed, balance not enough", async function() {
            const {chequeBank, signer} = await deployContract();
            const [, address1, address2, address3] = await ethers.getSigners();

            // create cheque
            let chequeData = await createCheque(address1.address, address2.address, chequeBank.address, address1);

            // create signOver
            let signOverData = await createSignOver(
                1, chequeData.chequeInfo.chequeId, address2.address, address3.address, address2);

            await chequeBank.connect(address3).notifySignOver([signOverData], chequeData);

            // redeem sign over success
            await expect(chequeBank.connect(address3).redeemSignOver(chequeData, [signOverData])).to.be.revertedWith("payer balance is not enough");
        });
    });
});