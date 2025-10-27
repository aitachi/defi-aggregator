import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("MetaTx Flow Integration", function () {
    async function deployMetaTxSystemFixture() {
        const [owner, relayer1, relayer2, user1, user2] = await ethers.getSigners();

        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        const forwarder = await MetaTxForwarder.deploy();
        await forwarder.waitForDeployment();

        const RelayerRegistry = await ethers.getContractFactory("RelayerRegistry");
        const relayerRegistry = await RelayerRegistry.deploy();
        await relayerRegistry.waitForDeployment();

        await relayerRegistry.registerRelayer(relayer1.address, "Relayer 1");
        await relayerRegistry.registerRelayer(relayer2.address, "Relayer 2");

        await forwarder.addRelayer(relayer1.address);
        await forwarder.addRelayer(relayer2.address);

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        await usdc.waitForDeployment();

        const GaslessVault = await ethers.getContractFactory("GaslessVault");
        const vault = await GaslessVault.deploy(
            await usdc.getAddress(),
            "Gasless Vault",
            "glVault",
            await forwarder.getAddress()
        );
        await vault.waitForDeployment();

        await usdc.mint(owner.address, ethers.parseUnits("200000", 6));

        await owner.sendTransaction({
            to: relayer1.address,
            value: ethers.parseEther("10")
        });
        await owner.sendTransaction({
            to: relayer2.address,
            value: ethers.parseEther("10")
        });

        return {
            forwarder,
            relayerRegistry,
            vault,
            usdc,
            owner,
            relayer1,
            relayer2,
            user1,
            user2
        };
    }

    async function signMetaTxRequest(signer: any, forwarder: any, request: any): Promise<string> {
        const chainId = (await ethers.provider.getNetwork()).chainId;

        const domain = {
            name: "MetaTxForwarder",
            version: "1",
            chainId: chainId,
            verifyingContract: await forwarder.getAddress()
        };

        const types = {
            ForwardRequest: [
                { name: "from", type: "address" },
                { name: "to", type: "address" },
                { name: "value", type: "uint256" },
                { name: "gas", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "data", type: "bytes" },
                { name: "deadline", type: "uint256" }
            ]
        };

        return await signer.signTypedData(domain, types, request);
    }

    describe("Complete Meta-Transaction Flow", function () {
        it("用户从零ETH账户完成存款操作", async function () {
            const { forwarder, vault, usdc, relayer1, user1, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const approveAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(owner).transfer(user1.address, approveAmount);

            await usdc.connect(user1).approve(await vault.getAddress(), approveAmount);

            const depositAmount = ethers.parseUnits("1000", 6);
            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);

            const currentTime = await time.latest();
            const request = {
                from: user1.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await forwarder.getNonce(user1.address)),
                data: data,
                deadline: currentTime + 3600
            };

            const signature = await signMetaTxRequest(user1, forwarder, request);

            await forwarder.connect(relayer1).execute(request, signature);

            const shares = await vault.balanceOf(user1.address);
            expect(shares).to.be.gt(0);
        });

        it("批量处理多个用户的元交易", async function () {
            const { forwarder, vault, usdc, relayer1, user1, user2, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const depositAmount = ethers.parseUnits("500", 6);

            await usdc.connect(owner).transfer(user1.address, depositAmount);
            await usdc.connect(owner).transfer(user2.address, depositAmount);

            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await usdc.connect(user2).approve(await vault.getAddress(), depositAmount);

            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);

            const currentTime = await time.latest();
            const requests = [
                {
                    from: user1.address,
                    to: await vault.getAddress(),
                    value: 0,
                    gas: 300000,
                    nonce: Number(await forwarder.getNonce(user1.address)),
                    data: data,
                    deadline: currentTime + 3600
                },
                {
                    from: user2.address,
                    to: await vault.getAddress(),
                    value: 0,
                    gas: 300000,
                    nonce: Number(await forwarder.getNonce(user2.address)),
                    data: data,
                    deadline: currentTime + 3600
                }
            ];

            const signatures = [
                await signMetaTxRequest(user1, forwarder, requests[0]),
                await signMetaTxRequest(user2, forwarder, requests[1])
            ];

            const tx = await forwarder.connect(relayer1).executeBatch(requests, signatures);
            const receipt = await tx.wait();

            const shares1 = await vault.balanceOf(user1.address);
            const shares2 = await vault.balanceOf(user2.address);

            expect(shares1).to.be.gt(0);
            expect(shares2).to.be.gt(0);

            const avgGasPerTx = receipt!.gasUsed / 2n;
            expect(avgGasPerTx).to.be.lt(500000);
        });
    });

    describe("Relayer Competition", function () {
        it("多个中继器应该能够处理相同用户的不同交易", async function () {
            const { forwarder, vault, usdc, relayer1, relayer2, user1, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const depositAmount = ethers.parseUnits("500", 6);
            await usdc.connect(owner).transfer(user1.address, depositAmount * 2n);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount * 2n);

            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);

            const currentTime = await time.latest();
            const request1 = {
                from: user1.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await forwarder.getNonce(user1.address)),
                data: data,
                deadline: currentTime + 3600
            };
            const sig1 = await signMetaTxRequest(user1, forwarder, request1);
            await forwarder.connect(relayer1).execute(request1, sig1);

            const request2 = {
                from: user1.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await forwarder.getNonce(user1.address)),
                data: data,
                deadline: currentTime + 3600
            };
            const sig2 = await signMetaTxRequest(user1, forwarder, request2);
            await forwarder.connect(relayer2).execute(request2, sig2);

            const shares = await vault.balanceOf(user1.address);
            const expectedShares = await vault.convertToShares(depositAmount * 2n);

            expect(shares).to.be.closeTo(expectedShares, expectedShares / 100n);
        });

        it("中继器不应该能够执行已被处理的交易", async function () {
            const { forwarder, vault, usdc, relayer1, relayer2, user1, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const depositAmount = ethers.parseUnits("500", 6);
            await usdc.connect(owner).transfer(user1.address, depositAmount);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);
            const currentTime = await time.latest();
            const request = {
                from: user1.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await forwarder.getNonce(user1.address)),
                data: data,
                deadline: currentTime + 3600
            };
            const signature = await signMetaTxRequest(user1, forwarder, request);

            await forwarder.connect(relayer1).execute(request, signature);

            await expect(
                forwarder.connect(relayer2).execute(request, signature)
            ).to.be.revertedWith("Invalid nonce");
        });
    });

    describe("Gas Sponsorship Models", function () {
        it("协议应该能够补贴用户的gas费用", async function () {
            const { forwarder, vault, usdc, relayer1, user1, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const GasSponsor = await ethers.getContractFactory("GasSponsor");
            const gasSponsor = await GasSponsor.deploy(await forwarder.getAddress());
            await gasSponsor.waitForDeployment();

            await owner.sendTransaction({
                to: await gasSponsor.getAddress(),
                value: ethers.parseEther("1")
            });

            const relayerBalanceBefore = await ethers.provider.getBalance(relayer1.address);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(owner).transfer(user1.address, depositAmount);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);
            const currentTime = await time.latest();
            const request = {
                from: user1.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await forwarder.getNonce(user1.address)),
                data: data,
                deadline: currentTime + 3600
            };
            const signature = await signMetaTxRequest(user1, forwarder, request);

            const tx = await forwarder.connect(relayer1).execute(request, signature);
            const receipt = await tx.wait();

            const gasCost = receipt!.gasUsed * tx.gasPrice!;

            await gasSponsor.connect(owner).setRefundAmount(relayer1.address, gasCost);
            await gasSponsor.connect(relayer1).claimRefund(receipt!.hash);

            const relayerBalanceAfter = await ethers.provider.getBalance(relayer1.address);

            expect(relayerBalanceAfter).to.be.closeTo(
                relayerBalanceBefore,
                ethers.parseEther("0.001")
            );
        });

        it("用户应该能够用代币支付gas费用", async function () {
            const { forwarder, vault, usdc, relayer1, user1, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const TokenGasPayment = await ethers.getContractFactory("TokenGasPayment");
            const tokenGasPayment = await TokenGasPayment.deploy(
                await forwarder.getAddress(),
                await usdc.getAddress()
            );
            await tokenGasPayment.waitForDeployment();

            const totalAmount = ethers.parseUnits("1010", 6);
            await usdc.connect(owner).transfer(user1.address, totalAmount);

            const gasPaymentAmount = ethers.parseUnits("10", 6);
            await usdc.connect(user1).approve(await tokenGasPayment.getAddress(), gasPaymentAmount);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);
            const currentTime = await time.latest();
            const request = {
                from: user1.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await forwarder.getNonce(user1.address)),
                data: data,
                deadline: currentTime + 3600
            };
            const signature = await signMetaTxRequest(user1, forwarder, request);

            const relayerUsdcBefore = await usdc.balanceOf(relayer1.address);

            await forwarder.connect(relayer1).execute(request, signature);

            const gasTokenAmount = ethers.parseUnits("5", 6);
            await tokenGasPayment.connect(user1).payForGas(user1.address, relayer1.address, gasTokenAmount);

            const relayerUsdcAfter = await usdc.balanceOf(relayer1.address);
            expect(relayerUsdcAfter).to.be.gt(relayerUsdcBefore);
        });
    });

    describe("Security Tests", function () {
        it("应该防止签名重放攻击", async function () {
            const { forwarder, vault, usdc, relayer1, user1, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const depositAmount = ethers.parseUnits("500", 6);
            await usdc.connect(owner).transfer(user1.address, depositAmount * 2n);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount * 2n);

            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);
            const currentTime = await time.latest();
            const request = {
                from: user1.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await forwarder.getNonce(user1.address)),
                data: data,
                deadline: currentTime + 3600
            };
            const signature = await signMetaTxRequest(user1, forwarder, request);

            await forwarder.connect(relayer1).execute(request, signature);

            await expect(
                forwarder.connect(relayer1).execute(request, signature)
            ).to.be.revertedWith("Invalid nonce");
        });

        it("应该验证签名者是请求发起者", async function () {
            const { forwarder, vault, usdc, relayer1, user1, user2, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const depositAmount = ethers.parseUnits("500", 6);
            await usdc.connect(owner).transfer(user2.address, depositAmount);
            await usdc.connect(user2).approve(await vault.getAddress(), depositAmount);

            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);
            const currentTime = await time.latest();
            const request = {
                from: user2.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await forwarder.getNonce(user2.address)),
                data: data,
                deadline: currentTime + 3600
            };

            const signature = await signMetaTxRequest(user1, forwarder, request);

            await expect(
                forwarder.connect(relayer1).execute(request, signature)
            ).to.be.revertedWith("Invalid signature");
        });

        it("应该防止gas价格操纵", async function () {
            const { forwarder, vault, usdc, relayer1, user1, owner } =
                await loadFixture(deployMetaTxSystemFixture);

            const depositAmount = ethers.parseUnits("500", 6);
            await usdc.connect(owner).transfer(user1.address, depositAmount);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            const data = vault.interface.encodeFunctionData("deposit", [depositAmount]);
            const currentTime = await time.latest();
            const request = {
                from: user1.address,
                to: await vault.getAddress(),
                value: 0,
                gas: 10000000,
                nonce: Number(await forwarder.getNonce(user1.address)),
                data: data,
                deadline: currentTime + 3600
            };
            const signature = await signMetaTxRequest(user1, forwarder, request);

            await expect(
                forwarder.connect(relayer1).execute(request, signature)
            ).to.be.revertedWith("Gas limit too high");
        });
    });
});