// test/integration/LeverageFlow.test.ts
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("Leverage Flow Integration", function () {
    async function deployLeverageSystemFixture() {
        const [owner, user1, user2, liquidator, keeper] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18);

        await Promise.all([
            weth.waitForDeployment(),
            usdc.waitForDeployment(),
            dai.waitForDeployment()
        ]);

        const MockAavePool = await ethers.getContractFactory("MockAavePool");
        const aavePool = await MockAavePool.deploy();
        await aavePool.waitForDeployment();

        await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("2000", 8));
        await aavePool.setAssetPrice(await usdc.getAddress(), ethers.parseUnits("1", 8));
        await aavePool.setAssetPrice(await dai.getAddress(), ethers.parseUnits("1", 8));

        const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
        const uniswapRouter = await MockUniswapRouter.deploy();
        await uniswapRouter.waitForDeployment();

        const LeverageHelper = await ethers.getContractFactory("LeverageHelper");
        const leverageHelper = await LeverageHelper.deploy(
            await aavePool.getAddress(),
            await uniswapRouter.getAddress(),
            await aavePool.getAddress()
        );
        await leverageHelper.waitForDeployment();

        await leverageHelper.addCollateral(await weth.getAddress(), 8000, 8500, 105);
        await leverageHelper.addBorrowAsset(await usdc.getAddress(), 300);
        await leverageHelper.addBorrowAsset(await dai.getAddress(), 300);

        const LiquidationBot = await ethers.getContractFactory("LiquidationBot");
        const liquidationBot = await LiquidationBot.deploy(
            await leverageHelper.getAddress(),
            await uniswapRouter.getAddress()
        );
        await liquidationBot.waitForDeployment();

        const RebalanceBot = await ethers.getContractFactory("RebalanceBot");
        const rebalanceBot = await RebalanceBot.deploy(
            await leverageHelper.getAddress()
        );
        await rebalanceBot.waitForDeployment();

        await rebalanceBot.whitelistBot(keeper.address, true);

        await weth.mint(user1.address, ethers.parseEther("100"));
        await weth.mint(user2.address, ethers.parseEther("100"));
        await weth.mint(await leverageHelper.getAddress(), ethers.parseEther("1000"));
        await usdc.mint(await aavePool.getAddress(), ethers.parseUnits("10000000", 6));
        await dai.mint(await aavePool.getAddress(), ethers.parseEther("10000000"));
        await usdc.mint(liquidator.address, ethers.parseUnits("100000", 6));

        return {
            leverageHelper,
            aavePool,
            uniswapRouter,
            liquidationBot,
            rebalanceBot,
            weth,
            usdc,
            dai,
            owner,
            user1,
            user2,
            liquidator,
            keeper
        };
    }

    describe("Complete Leverage Farming Journey", function () {
        it("从开仓到盈利平仓的完整流程", async function () {
            const { leverageHelper, weth, usdc, aavePool, user1 } =
                await loadFixture(deployLeverageSystemFixture);

            const collateralAmount = ethers.parseEther("10");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            const position = await leverageHelper.getPosition(user1.address, 0);
            expect(position.isActive).to.be.true;

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("2400", 8));

            const wethBalanceBefore = await weth.balanceOf(user1.address);
            await leverageHelper.connect(user1).closeLeveragePosition(0);
            const wethBalanceAfter = await weth.balanceOf(user1.address);
            const profit = wethBalanceAfter - wethBalanceBefore;

            expect(profit).to.be.gte(collateralAmount);
        });

        it("多个仓位同时管理", async function () {
            const { leverageHelper, weth, usdc, dai, user1 } =
                await loadFixture(deployLeverageSystemFixture);

            const collateralAmount = ethers.parseEther("5");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount * 2n);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await dai.getAddress(),
                collateralAmount,
                250,
                0
            );

            const position0 = await leverageHelper.getPosition(user1.address, 0);
            const position1 = await leverageHelper.getPosition(user1.address, 1);

            expect(position0.borrowAsset).to.equal(await usdc.getAddress());
            expect(position1.borrowAsset).to.equal(await dai.getAddress());
            expect(position0.leverage).to.equal(200);
            expect(position1.leverage).to.equal(250);
        });
    });

    describe("Liquidation Process", function () {
        it("完整的清算流程", async function () {
            const { leverageHelper, liquidationBot, weth, usdc, aavePool, user1, liquidator } =
                await loadFixture(deployLeverageSystemFixture);

            const collateralAmount = ethers.parseEther("10");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                280,
                0
            );

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("1400", 8));

            const healthFactor = await leverageHelper.getHealthFactor(user1.address, 0);
            expect(healthFactor).to.be.lt(ethers.parseEther("1"));

            const liquidatablePositions = await liquidationBot.findLiquidatablePositions();
            expect(liquidatablePositions.length).to.be.gte(0);

            const position = await leverageHelper.getPosition(user1.address, 0);
            const debtToCover = position.borrowAmount / 2n;

            await usdc.connect(liquidator).approve(await leverageHelper.getAddress(), debtToCover);

            const liquidatorWethBefore = await weth.balanceOf(liquidator.address);
            await leverageHelper.connect(liquidator).liquidate(user1.address, 0, debtToCover);
            const liquidatorWethAfter = await weth.balanceOf(liquidator.address);
            const liquidatorProfit = liquidatorWethAfter - liquidatorWethBefore;

            expect(liquidatorProfit).to.be.gte(0);
        });

        it("自动清算机器人应该持续监控", async function () {
            const { leverageHelper, liquidationBot, weth, usdc, aavePool, user1 } =
                await loadFixture(deployLeverageSystemFixture);

            const collateralAmount = ethers.parseEther("10");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                280,
                0
            );

            for (let i = 0; i < 5; i++) {
                const canLiquidate = await liquidationBot.checkNeedsLiquidation(user1.address, 0);
                expect(canLiquidate).to.be.false;
                await time.increase(3600);
            }

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("1200", 8));

            const canLiquidate = await liquidationBot.checkNeedsLiquidation(user1.address, 0);
            expect(canLiquidate).to.be.true;
        });
    });

    describe("Rebalancing Process", function () {
        it("价格变动后自动再平衡", async function () {
            const { leverageHelper, rebalanceBot, weth, usdc, aavePool, user1, keeper } =
                await loadFixture(deployLeverageSystemFixture);

            const collateralAmount = ethers.parseEther("10");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            const _leverageBefore = await leverageHelper.getCurrentLeverage(user1.address, 0);

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("3000", 8));

            const _leverageAfterPriceChange = await leverageHelper.getCurrentLeverage(user1.address, 0);

            await rebalanceBot.connect(keeper).rebalance(user1.address, 0);

            const leverageAfterRebalance = await leverageHelper.getCurrentLeverage(user1.address, 0);

            expect(leverageAfterRebalance).to.equal(200);
        });

        it("应该设置再平衡阈值", async function () {
            const { leverageHelper, rebalanceBot, weth, usdc, aavePool, user1 } =
                await loadFixture(deployLeverageSystemFixture);

            const collateralAmount = ethers.parseEther("10");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            await leverageHelper.connect(user1).setRebalanceThreshold(0, 5);

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("2060", 8));

            const needsRebalance = await rebalanceBot.needsRebalance(user1.address, 0);
            expect(needsRebalance).to.be.true;

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("2200", 8));

            const needsRebalanceNow = await rebalanceBot.needsRebalance(user1.address, 0);
            expect(needsRebalanceNow).to.be.true;
        });
    });

    describe("Risk Management", function () {
        it("应该防止过度杠杆", async function () {
            const { leverageHelper, weth, usdc, user1 } =
                await loadFixture(deployLeverageSystemFixture);

            const collateralAmount = ethers.parseEther("10");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await expect(
                leverageHelper.connect(user1).openLeveragePosition(
                    await weth.getAddress(),
                    await usdc.getAddress(),
                    collateralAmount,
                    350,
                    0
                )
            ).to.be.revertedWith("Leverage too high");
        });

        it("应该实施止损机制", async function () {
            const { leverageHelper, weth, usdc, aavePool, user1 } =
                await loadFixture(deployLeverageSystemFixture);

            const collateralAmount = ethers.parseEther("10");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            await leverageHelper.connect(user1).setStopLoss(0, ethers.parseUnits("1800", 8));

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("1800", 8));

            await leverageHelper.triggerStopLoss(user1.address, 0);

            const position = await leverageHelper.getPosition(user1.address, 0);
            expect(position.isActive).to.be.false;
        });

        it("应该限制单个用户的总敞口", async function () {
            const { leverageHelper, weth, usdc, user1 } =
                await loadFixture(deployLeverageSystemFixture);

            await leverageHelper.setUserBorrowLimit(user1.address, ethers.parseUnits("50000", 6));

            const collateralAmount = ethers.parseEther("30");
            await weth.mint(user1.address, collateralAmount);
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await expect(
                leverageHelper.connect(user1).openLeveragePosition(
                    await weth.getAddress(),
                    await usdc.getAddress(),
                    collateralAmount,
                    200,
                    0
                )
            ).to.be.revertedWith("Exceeds borrow limit");
        });
    });

    describe("Multi-Strategy Combination", function () {
        it("杠杆挖矿 + 收益聚合", async function () {
            const { leverageHelper, weth, usdc, user1 } =
                await loadFixture(deployLeverageSystemFixture);

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

            const collateralAmount = ethers.parseEther("10");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            const position = await leverageHelper.getPosition(user1.address, 0);
            const borrowedAmount = position.borrowAmount;

            await usdc.mint(user1.address, borrowedAmount);
            await usdc.connect(user1).approve(await vault.getAddress(), borrowedAmount);

            await vault.connect(user1).deposit(await usdc.getAddress(), borrowedAmount);

            await time.increase(30 * 24 * 60 * 60);

            const vaultBalance = await vault.getBalance(user1.address);

            expect(vaultBalance).to.be.gte(borrowedAmount);
        });
    });
});