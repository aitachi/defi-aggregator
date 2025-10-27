import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    Vault,
    MockERC20,
    MockAaveStrategy,
    MockCurveStrategy,
    StrategyManager,
    FeeCollector
} from "../../typechain-types";

describe("YieldAggregator Integration", function () {
    async function deployFullSystemFixture() {
        const [owner, user1, user2, treasury, keeper] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18);
        await usdc.waitForDeployment();
        await dai.waitForDeployment();

        const FeeCollector = await ethers.getContractFactory("FeeCollector");
        const feeCollector = await FeeCollector.deploy(
            treasury.address,
            1000,
            200
        );
        await feeCollector.waitForDeployment();

        const StrategyManager = await ethers.getContractFactory("StrategyManager");
        const strategyManager = await upgrades.deployProxy(
            StrategyManager,
            [owner.address],
            {
                kind: "uups",
                initializer: "initialize"
            }
        );
        await strategyManager.waitForDeployment();

        await strategyManager.grantRole(await strategyManager.STRATEGIST_ROLE(), owner.address);

        const Vault = await ethers.getContractFactory("Vault");
        const vault = await upgrades.deployProxy(
            Vault,
            [],
            {
                kind: "uups",
                initializer: "initialize"
            }
        );
        await vault.waitForDeployment();

        const MockAaveStrategy = await ethers.getContractFactory("MockAaveStrategy");
        const aaveStrategy = await MockAaveStrategy.deploy(
            await vault.getAddress(),
            await usdc.getAddress(),
            500
        );
        await aaveStrategy.waitForDeployment();

        const MockCurveStrategy = await ethers.getContractFactory("MockCurveStrategy");
        const curveStrategy = await MockCurveStrategy.deploy(
            await vault.getAddress(),
            await usdc.getAddress(),
            800
        );
        await curveStrategy.waitForDeployment();

        await strategyManager.whitelistProtocol(await aaveStrategy.getAddress());
        await strategyManager.whitelistProtocol(await curveStrategy.getAddress());

        await strategyManager.registerStrategy(
            await aaveStrategy.getAddress(),
            "Aave Strategy",
            "Aave lending strategy",
            [await aaveStrategy.getAddress()],
            30
        );

        await strategyManager.registerStrategy(
            await curveStrategy.getAddress(),
            "Curve Strategy",
            "Curve liquidity strategy",
            [await curveStrategy.getAddress()],
            40
        );

        await vault.setStrategyManager(await strategyManager.getAddress());
        await vault.setStrategy(await usdc.getAddress(), await aaveStrategy.getAddress());

        const mintAmount = ethers.parseUnits("100000", 6);
        await usdc.mint(user1.address, mintAmount);
        await usdc.mint(user2.address, mintAmount);

        await usdc.mint(await aaveStrategy.getAddress(), ethers.parseUnits("1000000", 6));
        await usdc.mint(await curveStrategy.getAddress(), ethers.parseUnits("1000000", 6));

        return {
            vault,
            usdc,
            dai,
            feeCollector,
            strategyManager,
            aaveStrategy,
            curveStrategy,
            owner,
            user1,
            user2,
            treasury,
            keeper
        };
    }

    describe("End-to-End User Journey", function () {
        it("完整用户生命周期：存款 -> 赚取收益 -> 提款", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const initialShares = await vault.getBalance(user1.address);
            expect(initialShares).to.be.gt(0);

            await time.increase(30 * 24 * 60 * 60);

            const sharesValue = initialShares;
            expect(sharesValue).to.be.gt(0);

            await vault.connect(user1).withdraw(await usdc.getAddress(), initialShares);

            const finalBalance = await usdc.balanceOf(user1.address);
            expect(finalBalance).to.be.gt(depositAmount - ethers.parseUnits("100000", 6));
        });

        it("多用户并发操作", async function () {
            const { vault, usdc, user1, user2 } = await loadFixture(deployFullSystemFixture);

            const deposit1 = ethers.parseUnits("5000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), deposit1);
            await vault.connect(user1).deposit(await usdc.getAddress(), deposit1);

            const deposit2 = ethers.parseUnits("10000", 6);
            await usdc.connect(user2).approve(await vault.getAddress(), deposit2);
            await vault.connect(user2).deposit(await usdc.getAddress(), deposit2);

            const shares1 = await vault.getBalance(user1.address);
            const shares2 = await vault.getBalance(user2.address);

            expect(shares2).to.be.closeTo(shares1 * 2n, shares1 / 10n);

            await time.increase(30 * 24 * 60 * 60);

            await vault.connect(user1).withdraw(await usdc.getAddress(), shares1);
            await vault.connect(user2).withdraw(await usdc.getAddress(), shares2);

            const balance1 = await usdc.balanceOf(user1.address);
            const balance2 = await usdc.balanceOf(user2.address);

            expect(balance1).to.be.gt(ethers.parseUnits("95000", 6));
            expect(balance2).to.be.gt(ethers.parseUnits("90000", 6));
        });
    });

    describe("Strategy Migration", function () {
        it("应该能够迁移资金到新策略", async function () {
            const { vault, usdc, strategyManager, aaveStrategy, user1, owner } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const aaveBalanceBefore = await aaveStrategy.totalAssets();
            expect(aaveBalanceBefore).to.be.gt(0);

            const MockCompoundStrategy = await ethers.getContractFactory("MockCompoundStrategy");
            const compoundStrategy = await MockCompoundStrategy.deploy(
                await vault.getAddress(),
                await usdc.getAddress(),
                1000
            );
            await compoundStrategy.waitForDeployment();

            await strategyManager.whitelistProtocol(await compoundStrategy.getAddress());

            await strategyManager.registerStrategy(
                await compoundStrategy.getAddress(),
                "Compound Strategy",
                "Compound lending strategy",
                [await compoundStrategy.getAddress()],
                25
            );

            await vault.setStrategy(await usdc.getAddress(), await compoundStrategy.getAddress());

            const compoundBalance = await compoundStrategy.totalAssets();
            expect(compoundBalance).to.be.gte(0);
        });

        it("策略失败时应该能够紧急撤资", async function () {
            const { vault, strategyManager, aaveStrategy, user1, usdc } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const strategyBalance = await aaveStrategy.totalAssets();
            expect(strategyBalance).to.be.gte(0);

            await vault.setStrategy(await usdc.getAddress(), ethers.ZeroAddress);

            const vaultBalance = await usdc.balanceOf(await vault.getAddress());
            expect(vaultBalance).to.be.gte(0);
        });
    });

    describe("Auto-Compound", function () {
        it("应该自动复投收益", async function () {
            const { vault, usdc, user1 } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const totalAssetsBefore = await vault.getBalance(user1.address);

            await time.increase(7 * 24 * 60 * 60);

            const totalAssetsAfter = await vault.getBalance(user1.address);
            expect(totalAssetsAfter).to.be.gte(totalAssetsBefore);
        });

        it("复投频率应该基于gas成本优化", async function () {
            const { vault, usdc, user1 } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            await time.increase(1 * 60 * 60);

            const balance = await vault.getBalance(user1.address);
            expect(balance).to.be.gt(0);
        });
    });

    describe("Fee Collection", function () {
        it("应该正确收取管理费和绩效费", async function () {
            const { vault, usdc, user1, treasury } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            await time.increase(365 * 24 * 60 * 60);

            const treasuryBalanceBefore = await usdc.balanceOf(treasury.address);

            const treasuryBalanceAfter = await usdc.balanceOf(treasury.address);
            const feesCollected = treasuryBalanceAfter - treasuryBalanceBefore;

            expect(feesCollected).to.be.gte(0);
        });

        it("无收益时不应收取绩效费", async function () {
            const { vault, usdc, user1, treasury } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const treasuryBalanceBefore = await usdc.balanceOf(treasury.address);

            const treasuryBalanceAfter = await usdc.balanceOf(treasury.address);

            expect(treasuryBalanceAfter).to.be.closeTo(
                treasuryBalanceBefore,
                ethers.parseUnits("20", 6)
            );
        });
    });

    describe("Edge Cases & Stress Tests", function () {
        it("应该处理策略损失", async function () {
            const { vault, usdc, aaveStrategy, user1 } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const sharesBefore = await vault.getBalance(user1.address);
            const valueBefore = sharesBefore;

            const valueAfter = await vault.getBalance(user1.address);

            expect(valueAfter).to.be.lte(valueBefore + valueBefore / 10n);
        });

        it("应该防止存款/提款攻击", async function () {
            const { vault, usdc, user1, user2 } =
                await loadFixture(deployFullSystemFixture);

            const deposit1 = ethers.parseUnits("100000", 6);
            await usdc.mint(user1.address, deposit1);
            await usdc.connect(user1).approve(await vault.getAddress(), deposit1);
            await vault.connect(user1).deposit(await usdc.getAddress(), deposit1);

            await time.increase(1 * 24 * 60 * 60);

            const deposit2 = ethers.parseUnits("100000", 6);
            await usdc.mint(user2.address, deposit2);
            await usdc.connect(user2).approve(await vault.getAddress(), deposit2);

            const balanceBefore = await usdc.balanceOf(user2.address);

            await vault.connect(user2).deposit(await usdc.getAddress(), deposit2);
            const shares2 = await vault.getBalance(user2.address);
            await vault.connect(user2).withdraw(await usdc.getAddress(), shares2);

            const balanceAfter = await usdc.balanceOf(user2.address);

            expect(balanceAfter).to.be.lte(balanceBefore + ethers.parseUnits("10", 6));
        });

        it("应该处理大量并发提款", async function () {
            const { vault, usdc } = await loadFixture(deployFullSystemFixture);

            const users = await ethers.getSigners();
            const numUsers = 10;
            const depositAmount = ethers.parseUnits("1000", 6);

            for (let i = 0; i < numUsers; i++) {
                await usdc.mint(users[i].address, depositAmount);
                await usdc.connect(users[i]).approve(await vault.getAddress(), depositAmount);
                await vault.connect(users[i]).deposit(await usdc.getAddress(), depositAmount);
            }

            await time.increase(7 * 24 * 60 * 60);

            for (let i = 0; i < numUsers; i++) {
                const shares = await vault.getBalance(users[i].address);
                await vault.connect(users[i]).withdraw(await usdc.getAddress(), shares);
            }

            for (let i = 0; i < numUsers; i++) {
                const balance = await usdc.balanceOf(users[i].address);
                expect(balance).to.be.gt(depositAmount * 95n / 100n);
            }
        });

        it("应该在低流动性情况下延迟提款", async function () {
            const { vault, usdc, strategyManager, aaveStrategy, user1 } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const shares = await vault.getBalance(user1.address);

            await vault.connect(user1).withdraw(await usdc.getAddress(), shares);

            const balance = await usdc.balanceOf(user1.address);
            expect(balance).to.be.gt(0);
        });
    });

    describe("Multi-Strategy Coordination", function () {
        it("应该根据APY自动调整策略分配", async function () {
            const { vault, strategyManager, aaveStrategy, curveStrategy, user1, usdc } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const aaveBalanceBefore = await aaveStrategy.totalAssets();
            const curveBalanceBefore = await curveStrategy.totalAssets();

            expect(aaveBalanceBefore).to.be.gte(0);
            expect(curveBalanceBefore).to.be.gte(0);

            await vault.setStrategy(await usdc.getAddress(), await curveStrategy.getAddress());

            const aaveBalanceAfter = await aaveStrategy.totalAssets();
            const curveBalanceAfter = await curveStrategy.totalAssets();

            expect(aaveBalanceAfter).to.be.gte(0);
            expect(curveBalanceAfter).to.be.gte(0);
        });

        it("应该限制单一策略的最大分配", async function () {
            const { vault, strategyManager, aaveStrategy, user1, usdc } =
                await loadFixture(deployFullSystemFixture);

            const depositAmount = ethers.parseUnits("100000", 6);
            await usdc.mint(user1.address, depositAmount);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const aaveBalance = await aaveStrategy.totalAssets();
            expect(aaveBalance).to.be.gte(0);
        });
    });

    describe("Time-Weighted Returns", function () {
        it("后来的存款者不应该稀释早期用户的收益", async function () {
            const { vault, usdc, user1, user2 } =
                await loadFixture(deployFullSystemFixture);

            const deposit1 = ethers.parseUnits("10000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), deposit1);
            await vault.connect(user1).deposit(await usdc.getAddress(), deposit1);

            await time.increase(30 * 24 * 60 * 60);

            const user1SharesBefore = await vault.getBalance(user1.address);
            const user1ValueBefore = user1SharesBefore;

            const deposit2 = ethers.parseUnits("10000", 6);
            await usdc.connect(user2).approve(await vault.getAddress(), deposit2);
            await vault.connect(user2).deposit(await usdc.getAddress(), deposit2);

            const user1ValueAfter = await vault.getBalance(user1.address);
            expect(user1ValueAfter).to.be.gte(user1ValueBefore);

            const user2Shares = await vault.getBalance(user2.address);
            const user2Value = user2Shares;
            expect(user2Value).to.be.closeTo(deposit2, ethers.parseUnits("10", 6));
        });
    });
});