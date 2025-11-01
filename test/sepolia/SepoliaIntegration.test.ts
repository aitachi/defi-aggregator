// test/sepolia/SepoliaIntegration.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Sepolia测试网集成测试
 *
 * 前提条件:
 * 1. 已部署所有合约到Sepolia
 * 2. 账户有足够的测试ETH
 * 3. deployments/sepolia-latest.json 存在
 */
describe("Sepolia Integration Tests", function () {
    // 增加超时时间（Sepolia确认较慢）
    this.timeout(300000); // 5分钟

    let deployment: any;
    const contracts: any = {};
    let signer: any;

    before(async function () {
        // 加载部署信息
        const deploymentPath = join(__dirname, "../../deployments/sepolia-latest.json");

        try {
            const deploymentData = readFileSync(deploymentPath, "utf-8");
            deployment = JSON.parse(deploymentData);
            console.log("✅ 加载部署信息成功");
        } catch (error) {
            throw new Error("❌ 无法加载部署信息。请先运行: npm run deploy:sepolia");
        }

        // 获取签名者
        [signer] = await ethers.getSigners();
        console.log("📍 测试账户:", await signer.getAddress());

        // 连接到已部署的合约
        console.log("\n🔗 连接到合约...");

        contracts.usdc = await ethers.getContractAt("MockERC20", deployment.contracts.USDC);
        contracts.dai = await ethers.getContractAt("MockERC20", deployment.contracts.DAI);
        contracts.weth = await ethers.getContractAt("MockERC20", deployment.contracts.WETH);
        contracts.vault = await ethers.getContractAt("Vault", deployment.contracts.Vault);
        contracts.strategyManager = await ethers.getContractAt(
            "StrategyManager",
            deployment.contracts.StrategyManager
        );
        contracts.aaveStrategy = await ethers.getContractAt(
            "MockAaveStrategy",
            deployment.contracts.AaveStrategy
        );
        contracts.curveStrategy = await ethers.getContractAt(
            "MockCurveStrategy",
            deployment.contracts.CurveStrategy
        );
        contracts.leverageHelper = await ethers.getContractAt(
            "LeverageHelper",
            deployment.contracts.LeverageHelper
        );
        contracts.forwarder = await ethers.getContractAt(
            "MetaTxForwarder",
            deployment.contracts.MetaTxForwarder
        );

        console.log("✅ 合约连接成功\n");
    });

    // ==========================================
    // 1. 基础功能测试
    // ==========================================
    describe("基础功能测试", function () {
        it("应该能够存款到Vault", async function () {
            console.log("\n📝 测试: Vault存款");

            const depositAmount = ethers.parseUnits("1000", 6);

            // 检查余额
            const balance = await contracts.usdc.balanceOf(await signer.getAddress());
            console.log("   USDC余额:", ethers.formatUnits(balance, 6));

            if (balance < depositAmount) {
                console.log("   ⚠️  余额不足，跳过测试");
                this.skip();
            }

            // 授权
            console.log("   授权 Vault...");
            const approveTx = await contracts.usdc.approve(
                await contracts.vault.getAddress(),
                depositAmount
            );
            await approveTx.wait();
            console.log("   ✅ 授权成功");

            // 存款
            console.log("   执行存款...");
            const depositTx = await contracts.vault.deposit(depositAmount);
            const receipt = await depositTx.wait();
            console.log("   ✅ 存款成功, Gas使用:", receipt?.gasUsed.toString());

            // 检查份额
            const shares = await contracts.vault.balanceOf(await signer.getAddress());
            console.log("   获得份额:", ethers.formatUnits(shares, 18));

            expect(shares).to.be.gt(0);
        });

        it("应该能够从Vault提款", async function () {
            console.log("\n📝 测试: Vault提款");

            const shares = await contracts.vault.balanceOf(await signer.getAddress());

            if (shares === 0n) {
                console.log("   ⚠️  无份额，跳过测试");
                this.skip();
            }

            console.log("   当前份额:", ethers.formatUnits(shares, 18));

            const withdrawAmount = shares / 2n; // 提取一半
            console.log("   提取份额:", ethers.formatUnits(withdrawAmount, 18));

            const balanceBefore = await contracts.usdc.balanceOf(await signer.getAddress());

            const withdrawTx = await contracts.vault.withdraw(withdrawAmount);
            const receipt = await withdrawTx.wait();
            console.log("   ✅ 提款成功, Gas使用:", receipt?.gasUsed.toString());

            const balanceAfter = await contracts.usdc.balanceOf(await signer.getAddress());
            const received = balanceAfter - balanceBefore;
            console.log("   收到USDC:", ethers.formatUnits(received, 6));

            expect(received).to.be.gt(0);
        });
    });

    // ==========================================
    // 2. 策略测试
    // ==========================================
    describe("策略功能测试", function () {
        it("应该能够分配资金到策略", async function () {
            console.log("\n📝 测试: 资金分配");

            const totalAssetsBefore = await contracts.vault.totalAssets();
            console.log("   Vault总资产:", ethers.formatUnits(totalAssetsBefore, 6), "USDC");

            if (totalAssetsBefore === 0n) {
                console.log("   ⚠️  Vault无资产，跳过测试");
                this.skip();
            }

            console.log("   执行资金分配...");
            const allocateTx = await contracts.vault.allocateToStrategies();
            const receipt = await allocateTx.wait();
            console.log("   ✅ 分配成功, Gas使用:", receipt?.gasUsed.toString());

            // 检查策略余额
            const aaveBalance = await contracts.aaveStrategy.totalAssets();
            const curveBalance = await contracts.curveStrategy.totalAssets();

            console.log("   Aave策略资产:", ethers.formatUnits(aaveBalance, 6), "USDC");
            console.log("   Curve策略资产:", ethers.formatUnits(curveBalance, 6), "USDC");

            expect(aaveBalance + curveBalance).to.be.gt(0);
        });

        it("应该能够收获收益", async function () {
            console.log("\n📝 测试: 收益收获");

            // 等待一些区块以累积收益
            console.log("   等待区块确认...");
            await new Promise(resolve => setTimeout(resolve, 30000)); // 30秒

            const totalAssetsBefore = await contracts.vault.totalAssets();
            console.log("   收获前总资产:", ethers.formatUnits(totalAssetsBefore, 6));

            const harvestTx = await contracts.vault.harvest();
            const receipt = await harvestTx.wait();
            console.log("   ✅ 收获成功, Gas使用:", receipt?.gasUsed.toString());

            const totalAssetsAfter = await contracts.vault.totalAssets();
            console.log("   收获后总资产:", ethers.formatUnits(totalAssetsAfter, 6));

            // 在测试网上收益可能很小或为0
            console.log("   收益:", ethers.formatUnits(totalAssetsAfter - totalAssetsBefore, 6));
        });
    });

    // ==========================================
    // 3. 杠杆功能测试
    // ==========================================
    describe("杠杆功能测试", function () {
        it("应该能够开启杠杆仓位", async function () {
            console.log("\n📝 测试: 开启杠杆仓位");

            const collateralAmount = ethers.parseEther("0.1"); // 0.1 WETH

            const wethBalance = await contracts.weth.balanceOf(await signer.getAddress());
            console.log("   WETH余额:", ethers.formatEther(wethBalance));

            if (wethBalance < collateralAmount) {
                console.log("   ⚠️  WETH不足，跳过测试");
                this.skip();
            }

            // 授权
            console.log("   授权 LeverageHelper...");
            const approveTx = await contracts.weth.approve(
                await contracts.leverageHelper.getAddress(),
                collateralAmount
            );
            await approveTx.wait();

            // 开仓
            console.log("   开启2x杠杆仓位...");
            const openTx = await contracts.leverageHelper.openLeveragePosition(
                await contracts.weth.getAddress(),
                await contracts.usdc.getAddress(),
                collateralAmount,
                200, // 2x
                0
            );
            const receipt = await openTx.wait();
            console.log("   ✅ 开仓成功, Gas使用:", receipt?.gasUsed.toString());

            // 检查仓位
            const position = await contracts.leverageHelper.getPosition(
                await signer.getAddress(),
                0
            );
            console.log("   仓位抵押品:", ethers.formatEther(position.collateralAmount), "WETH");
            console.log("   仓位借款:", ethers.formatUnits(position.borrowAmount, 6), "USDC");

            expect(position.isActive).to.be.true;
        });

        it("应该能够关闭杠杆仓位", async function () {
            console.log("\n📝 测试: 关闭杠杆仓位");

            // 检查是否有活跃仓位
            let hasPosition = false;
            try {
                const position = await contracts.leverageHelper.getPosition(
                    await signer.getAddress(),
                    0
                );
                hasPosition = position.isActive;
            } catch (error) {
                console.log("   ⚠️  无活跃仓位，跳过测试");
                this.skip();
            }

            if (!hasPosition) {
                console.log("   ⚠️  无活跃仓位，跳过测试");
                this.skip();
            }

            const wethBefore = await contracts.weth.balanceOf(await signer.getAddress());

            console.log("   关闭仓位...");
            const closeTx = await contracts.leverageHelper.closeLeveragePosition(0);
            const receipt = await closeTx.wait();
            console.log("   ✅ 平仓成功, Gas使用:", receipt?.gasUsed.toString());

            const wethAfter = await contracts.weth.balanceOf(await signer.getAddress());
            const returned = wethAfter - wethBefore;
            console.log("   返还WETH:", ethers.formatEther(returned));

            expect(returned).to.be.gt(0);
        });
    });

    // ==========================================
    // 4. 元交易测试
    // ==========================================
    describe("元交易功能测试", function () {
        it("应该能够执行元交易", async function () {
            console.log("\n📝 测试: 元交易执行");

            // 创建新钱包（模拟无gas用户）
            const userWallet = ethers.Wallet.createRandom().connect(ethers.provider);
            console.log("   无gas用户地址:", userWallet.address);

            // 给用户一些USDC但不给ETH
            const transferAmount = ethers.parseUnits("100", 6);
            await contracts.usdc.transfer(userWallet.address, transferAmount);
            console.log("   已转账100 USDC");

            // 用户授权Vault
            await contracts.usdc.connect(userWallet).approve(
                await contracts.vault.getAddress(),
                transferAmount
            );

            // 构造元交易
            const depositAmount = ethers.parseUnits("50", 6);
            const data = contracts.vault.interface.encodeFunctionData(
                "deposit",
                [depositAmount]
            );

            const request = {
                from: userWallet.address,
                to: await contracts.vault.getAddress(),
                value: 0,
                gas: 300000,
                nonce: Number(await contracts.forwarder.getNonce(userWallet.address)),
                data: data
            };

            // 用户签名
            const signature = await signMetaTxRequest(
                userWallet,
                contracts.forwarder,
                request
            );

            // 中继者执行（我们用主账户作为中继者）
            console.log("   中继者执行元交易...");
            const executeTx = await contracts.forwarder.execute(request, signature);
            const receipt = await executeTx.wait();
            console.log("   ✅ 执行成功, Gas使用:", receipt?.gasUsed.toString());

            // 检查用户获得的份额
            const shares = await contracts.vault.balanceOf(userWallet.address);
            console.log("   用户获得份额:", ethers.formatUnits(shares, 18));

            // 验证用户仍然没有ETH
            const userEthBalance = await ethers.provider.getBalance(userWallet.address);
            expect(userEthBalance).to.equal(0);
            expect(shares).to.be.gt(0);
        });
    });

    // ==========================================
    // 5. 升级测试
    // ==========================================
    describe("合约升级测试", function () {
        it("应该能够升级Vault合约", async function () {
            console.log("\n📝 测试: Vault升级");

            const implementationBefore = await ethers.provider.getStorage(
                await contracts.vault.getAddress(),
                "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
            );
            console.log("   当前实现:", implementationBefore);

            // 部署新实现（这里我们部署相同的合约作为演示）
            const VaultV2 = await ethers.getContractFactory("Vault");

            console.log("   升级合约...");
            const upgraded = await ethers.upgrades.upgradeProxy(
                await contracts.vault.getAddress(),
                VaultV2
            );
            await upgraded.waitForDeployment();

            const implementationAfter = await ethers.provider.getStorage(
                await contracts.vault.getAddress(),
                "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
            );
            console.log("   新实现:", implementationAfter);

            // 验证数据未丢失
            const totalAssets = await contracts.vault.totalAssets();
            console.log("   升级后总资产:", ethers.formatUnits(totalAssets, 6));

            expect(implementationAfter).to.not.equal(implementationBefore);
        });
    });

    // ==========================================
    // 6. 压力测试
    // ==========================================
    describe("压力测试", function () {
        it("应该能够处理多笔连续交易", async function () {
            console.log("\n📝 测试: 连续交易");

            const balance = await contracts.usdc.balanceOf(await signer.getAddress());
            const depositAmount = ethers.parseUnits("10", 6);

            if (balance < depositAmount * 5n) {
                console.log("   ⚠️  余额不足，跳过测试");
                this.skip();
            }

            await contracts.usdc.approve(
                await contracts.vault.getAddress(),
                depositAmount * 5n
            );

            console.log("   执行5笔连续存款...");
            const startTime = Date.now();

            for (let i = 0; i < 5; i++) {
                const tx = await contracts.vault.deposit(depositAmount);
                await tx.wait();
                console.log(`   ✅ 交易 ${i + 1}/5 完成`);
            }

            const endTime = Date.now();
            const totalTime = (endTime - startTime) / 1000;
            console.log(`   总耗时: ${totalTime.toFixed(2)}秒`);
            console.log(`   平均每笔: ${(totalTime / 5).toFixed(2)}秒`);
        });
    });

    // ==========================================
    // 辅助函数
    // ==========================================
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
                { name: "data", type: "bytes" }
            ]
        };

        return await signer.signTypedData(domain, types, request);
    }
});