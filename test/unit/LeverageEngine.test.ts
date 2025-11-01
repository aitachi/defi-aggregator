// test/unit/LeverageEngine.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("LeverageEngine", function () {
    // ==========================================
    // Fixtures
    // ==========================================
    async function deployLeverageFixture() {
        const [owner, user1, liquidator] = await ethers.getSigners();

        // 部署模拟代币
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        await weth.waitForDeployment();
        await usdc.waitForDeployment();

        // 部署模拟Aave池
        const MockAavePool = await ethers.getContractFactory("MockAavePool");
        const aavePool = await MockAavePool.deploy();
        await aavePool.waitForDeployment();

        // 设置模拟价格
        await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("2000", 8)); // $2000
        await aavePool.setAssetPrice(await usdc.getAddress(), ethers.parseUnits("1", 8)); // $1

        // 部署杠杆助手
        const LeverageHelper = await ethers.getContractFactory("LeverageHelper");
        const leverageHelper = await LeverageHelper.deploy(
            await aavePool.getAddress(),
            ethers.ZeroAddress, // Mock router
            ethers.ZeroAddress  // Mock oracle
        );
        await leverageHelper.waitForDeployment();

        // 配置抵押品
        await leverageHelper.addCollateral(
            await weth.getAddress(),
            8000, // 80% LTV
            8500, // 85% 清算阈值
            105   // 5% 清算奖励
        );

        // 配置借贷资产
        await leverageHelper.addBorrowAsset(
            await usdc.getAddress(),
            300 // 3x 最大杠杆
        );

        // 给用户铸造代币
        await weth.mint(user1.address, ethers.parseEther("10"));
        await usdc.mint(await aavePool.getAddress(), ethers.parseUnits("1000000", 6));

        return { leverageHelper, weth, usdc, aavePool, owner, user1, liquidator };
    }

    // ==========================================
    // 初始化测试
    // ==========================================
    describe("Deployment", function () {
        it("应该正确设置Aave池地址", async function () {
            const { leverageHelper, aavePool } = await loadFixture(deployLeverageFixture);

            expect(await leverageHelper.aavePool()).to.equal(await aavePool.getAddress());
        });

        it("应该正确添加抵押品", async function () {
            const { leverageHelper, weth } = await loadFixture(deployLeverageFixture);

            const collateral = await leverageHelper.getCollateralInfo(await weth.getAddress());
            expect(collateral.isActive).to.be.true;
            expect(collateral.ltv).to.equal(8000);
        });

        it("应该正确添加借贷资产", async function () {
            const { leverageHelper, usdc } = await loadFixture(deployLeverageFixture);

            const borrowAsset = await leverageHelper.getBorrowAssetInfo(await usdc.getAddress());
            expect(borrowAsset.isActive).to.be.true;
            expect(borrowAsset.maxLeverage).to.equal(300);
        });
    });

    // ==========================================
    // 开仓测试
    // ==========================================
    describe("Open Position", function () {
        it("应该允许开启杠杆仓位", async function () {
            const { leverageHelper, weth, usdc, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await expect(
                leverageHelper.connect(user1).openLeveragePosition(
                    await weth.getAddress(),
                    await usdc.getAddress(),
                    collateralAmount,
                    200, // 2x 杠杆
                    0
                )
            ).to.emit(leverageHelper, "PositionOpened");
        });

        it("开仓后应该创建正确的仓位", async function () {
            const { leverageHelper, weth, usdc, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            const position = await leverageHelper.getPosition(user1.address, 0);
            expect(position.collateralAsset).to.equal(await weth.getAddress());
            expect(position.borrowAsset).to.equal(await usdc.getAddress());
            expect(position.isActive).to.be.true;
        });

        it("应该正确计算借贷金额", async function () {
            const { leverageHelper, weth, usdc, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1"); // 1 WETH = $2000
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200, // 2x
                0
            );

            const position = await leverageHelper.getPosition(user1.address, 0);
            // 2x杠杆意味着借入等值抵押品的金额
            const expectedBorrow = ethers.parseUnits("2000", 6); // $2000 USDC
            expect(position.borrowAmount).to.be.closeTo(expectedBorrow, ethers.parseUnits("10", 6));
        });

        it("应该拒绝超过最大杠杆", async function () {
            const { leverageHelper, weth, usdc, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await expect(
                leverageHelper.connect(user1).openLeveragePosition(
                    await weth.getAddress(),
                    await usdc.getAddress(),
                    collateralAmount,
                    400, // 4x 超过限制
                    0
                )
            ).to.be.revertedWith("Leverage too high");
        });

        it("应该拒绝未授权的抵押品", async function () {
            const { leverageHelper, usdc, user1 } = await loadFixture(deployLeverageFixture);

            // 使用USDC作为抵押品（未配置）
            const collateralAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await expect(
                leverageHelper.connect(user1).openLeveragePosition(
                    await usdc.getAddress(),
                    await usdc.getAddress(),
                    collateralAmount,
                    200,
                    0
                )
            ).to.be.revertedWith("Collateral not supported");
        });
    });

    // ==========================================
    // 健康因子测试
    // ==========================================
    describe("Health Factor", function () {
        it("应该正确计算健康因子", async function () {
            const { leverageHelper, weth, usdc, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            const healthFactor = await leverageHelper.getHealthFactor(user1.address, 0);
            expect(healthFactor).to.be.gt(ethers.parseEther("1"));
        });

        it("价格下跌应该降低健康因子", async function () {
            const { leverageHelper, weth, usdc, aavePool, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            const healthBefore = await leverageHelper.getHealthFactor(user1.address, 0);

            // 价格下跌50%
            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("1000", 8));

            const healthAfter = await leverageHelper.getHealthFactor(user1.address, 0);
            expect(healthAfter).to.be.lt(healthBefore);
        });
    });

    // ==========================================
    // 平仓测试
    // ==========================================
    describe("Close Position", function () {
        it("应该允许用户平仓", async function () {
            const { leverageHelper, weth, usdc, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            await expect(
                leverageHelper.connect(user1).closeLeveragePosition(0)
            ).to.emit(leverageHelper, "PositionClosed");
        });

        it("平仓后仓位应该标记为非活跃", async function () {
            const { leverageHelper, weth, usdc, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            await leverageHelper.connect(user1).closeLeveragePosition(0);

            const position = await leverageHelper.getPosition(user1.address, 0);
            expect(position.isActive).to.be.false;
        });

        it("应该返还剩余抵押品", async function () {
            const { leverageHelper, weth, usdc, user1 } = await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            const wethBalanceBefore = await weth.balanceOf(user1.address);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            await leverageHelper.connect(user1).closeLeveragePosition(0);

            const wethBalanceAfter = await weth.balanceOf(user1.address);
            expect(wethBalanceAfter).to.be.gt(wethBalanceBefore);
        });
    });

    // ==========================================
    // 清算测试
    // ==========================================
    describe("Liquidation", function () {
        it("健康因子过低时应该允许清算", async function () {
            const { leverageHelper, weth, usdc, aavePool, user1, liquidator } =
                await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                250, // 2.5x 杠杆
                0
            );

            // 价格暴跌导致可清算
            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("800", 8));

            const debtAmount = ethers.parseUnits("1000", 6);
            await usdc.mint(liquidator.address, debtAmount);
            await usdc.connect(liquidator).approve(await leverageHelper.getAddress(), debtAmount);

            await expect(
                leverageHelper.connect(liquidator).liquidate(user1.address, 0, debtAmount)
            ).to.emit(leverageHelper, "PositionLiquidated");
        });

        it("清算者应该获得奖励", async function () {
            const { leverageHelper, weth, usdc, aavePool, user1, liquidator } =
                await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                250,
                0
            );

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("800", 8));

            const debtAmount = ethers.parseUnits("1000", 6);
            await usdc.mint(liquidator.address, debtAmount);
            await usdc.connect(liquidator).approve(await leverageHelper.getAddress(), debtAmount);

            const wethBalanceBefore = await weth.balanceOf(liquidator.address);

            await leverageHelper.connect(liquidator).liquidate(user1.address, 0, debtAmount);

            const wethBalanceAfter = await weth.balanceOf(liquidator.address);
            expect(wethBalanceAfter).to.be.gt(wethBalanceBefore);
        });

        it("健康因子正常时应该拒绝清算", async function () {
            const { leverageHelper, weth, usdc, user1, liquidator } =
                await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                150, // 低杠杆
                0
            );

            const debtAmount = ethers.parseUnits("500", 6);
            await usdc.mint(liquidator.address, debtAmount);
            await usdc.connect(liquidator).approve(await leverageHelper.getAddress(), debtAmount);

            await expect(
                leverageHelper.connect(liquidator).liquidate(user1.address, 0, debtAmount)
            ).to.be.revertedWith("Position is healthy");
        });
    });

    // ==========================================
    // 再平衡测试
    // ==========================================
    describe("Rebalance", function () {
        it("应该检测需要再平衡的仓位", async function () {
            const { leverageHelper, weth, usdc, aavePool, user1 } =
                await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            // 价格变化导致杠杆偏离
            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("2500", 8));

            const needsRebalance = await leverageHelper.needsRebalance(user1.address, 0, 200);
            expect(needsRebalance).to.be.true;
        });

        it("应该执行再平衡操作", async function () {
            const { leverageHelper, weth, usdc, aavePool, user1 } =
                await loadFixture(deployLeverageFixture);

            const collateralAmount = ethers.parseEther("1");
            await weth.connect(user1).approve(await leverageHelper.getAddress(), collateralAmount);

            await leverageHelper.connect(user1).openLeveragePosition(
                await weth.getAddress(),
                await usdc.getAddress(),
                collateralAmount,
                200,
                0
            );

            await aavePool.setAssetPrice(await weth.getAddress(), ethers.parseUnits("2500", 8));

            await expect(
                leverageHelper.rebalancePosition(user1.address, 0)
            ).to.emit(leverageHelper, "PositionRebalanced");
        });
    });
});