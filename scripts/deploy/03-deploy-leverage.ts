// scripts/deploy/03-deploy-leverage.ts
import { ethers } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

interface LeverageContracts {
    leverageHelper: string;
    liquidationBot: string;
    rebalanceBot: string;
    riskManager: string;
}

async function main() {
    console.log("🚀 开始部署杠杆引擎...\n");

    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);

    const deployedContracts: LeverageContracts = {} as LeverageContracts;

    // 读取核心系统部署信息
    const network = (await ethers.provider.getNetwork()).name;
    const coreDeploymentPath = join(__dirname, `../../deployments/core-${network}.json`);

    if (!existsSync(coreDeploymentPath)) {
        throw new Error("❌ 请先部署核心系统");
    }

    const coreDeployment = JSON.parse(readFileSync(coreDeploymentPath, "utf-8"));
    console.log("✅ 已加载核心系统部署信息\n");

    // ==========================================
    // 1. 部署杠杆助手
    // ==========================================
    console.log("📌 步骤 1: 部署 LeverageHelper");

    const AAVE_POOL = process.env.AAVE_V3_POOL || "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
    const UNISWAP_ROUTER = process.env.UNISWAP_V3_ROUTER || "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const LeverageHelper = await ethers.getContractFactory("LeverageHelper");
    const leverageHelper = await LeverageHelper.deploy(
        AAVE_POOL,
        UNISWAP_ROUTER,
        coreDeployment.contracts.priceOracle
    );
    await leverageHelper.waitForDeployment();
    deployedContracts.leverageHelper = await leverageHelper.getAddress();
    console.log("  ✅ LeverageHelper:", deployedContracts.leverageHelper, "\n");

    // ==========================================
    // 2. 部署清算机器人
    // ==========================================
    console.log("📌 步骤 2: 部署 LiquidationBot");

    const LiquidationBot = await ethers.getContractFactory("LiquidationBot");
    const liquidationBot = await LiquidationBot.deploy(
        deployedContracts.leverageHelper,
        AAVE_POOL
    );
    await liquidationBot.waitForDeployment();
    deployedContracts.liquidationBot = await liquidationBot.getAddress();
    console.log("  ✅ LiquidationBot:", deployedContracts.liquidationBot, "\n");

    // ==========================================
    // 3. 部署再平衡机器人
    // ==========================================
    console.log("📌 步骤 3: 部署 RebalanceBot");

    const RebalanceBot = await ethers.getContractFactory("RebalanceBot");
    const rebalanceBot = await RebalanceBot.deploy(
        deployedContracts.leverageHelper
    );
    await rebalanceBot.waitForDeployment();
    deployedContracts.rebalanceBot = await rebalanceBot.getAddress();
    console.log("  ✅ RebalanceBot:", deployedContracts.rebalanceBot, "\n");

    // ==========================================
    // 4. 部署风险管理器
    // ==========================================
    console.log("📌 步骤 4: 部署 RiskManager");

    const RiskManager = await ethers.getContractFactory("RiskManager");
    const riskManager = await RiskManager.deploy(
        coreDeployment.contracts.priceOracle
    );
    await riskManager.waitForDeployment();
    deployedContracts.riskManager = await riskManager.getAddress();
    console.log("  ✅ RiskManager:", deployedContracts.riskManager, "\n");

    // ==========================================
    // 5. 配置杠杆参数
    // ==========================================
    console.log("📌 步骤 5: 配置杠杆参数");

    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    // 配置抵押品
    await leverageHelper.addCollateral(
        WETH,
        8000, // 80% LTV
        8500, // 85% 清算阈值
        105   // 5% 清算奖励
    );
    console.log("  ✅ 已配置 WETH 抵押品");

    // 配置借贷资产
    await leverageHelper.addBorrowAsset(USDC, 300); // 3倍最大杠杆
    console.log("  ✅ 已配置 USDC 借贷");

    // 配置清算机器人
    await liquidationBot.setMinProfitBasisPoints(50); // 最小0.5%利润
    await liquidationBot.setHealthFactorThreshold(ethers.parseEther("1.05")); // 1.05健康度阈值
    console.log("  ✅ 清算机器人配置完成");

    // 配置再平衡机器人
    await rebalanceBot.setRebalanceThreshold(200); // 2%偏差触发再平衡
    await rebalanceBot.setMaxGasPrice(ethers.parseUnits("100", "gwei"));
    console.log("  ✅ 再平衡机器人配置完成\n");

    // ==========================================
    // 6. 授予权限
    // ==========================================
    console.log("📌 步骤 6: 授予权限");

    const KEEPER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("KEEPER_ROLE"));

    const accessControl = await ethers.getContractAt(
        "AdvancedAccessControl",
        coreDeployment.contracts.accessControl
    );

    await accessControl.grantRole(KEEPER_ROLE, deployedContracts.liquidationBot);
    await accessControl.grantRole(KEEPER_ROLE, deployedContracts.rebalanceBot);
    console.log("  ✅ 已授予 Keeper 权限\n");

    // ==========================================
    // 7. 保存部署信息
    // ==========================================
    console.log("📌 步骤 7: 保存部署信息");

    const deploymentInfo = {
        network,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: deployedContracts,
        configuration: {
            supportedCollateral: [
                { asset: WETH, ltv: 8000, liquidationThreshold: 8500 }
            ],
            supportedBorrowAssets: [
                { asset: USDC, maxLeverage: 300 }
            ],
            liquidationConfig: {
                minProfitBps: 50,
                healthFactorThreshold: "1.05"
            },
            rebalanceConfig: {
                threshold: 200,
                maxGasPrice: "100 gwei"
            }
        }
    };

    const filename = join(__dirname, `../../deployments/leverage-${network}.json`);
    writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log("  ✅ 部署信息已保存:", filename, "\n");

    // ==========================================
    // 8. 部署验证
    // ==========================================
    console.log("📌 步骤 8: 验证部署");

    const collateralCount = await leverageHelper.getCollateralCount();
    console.log("  支持的抵押品数量:", collateralCount);

    const borrowAssetCount = await leverageHelper.getBorrowAssetCount();
    console.log("  支持的借贷资产数量:", borrowAssetCount);

    console.log("\n✅ 杠杆引擎部署完成！\n");
    console.log("=" .repeat(60));
    console.log("📝 重要地址:");
    console.log("=" .repeat(60));
    Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`${name.padEnd(20)}: ${address}`);
    });
    console.log("=" .repeat(60));
    console.log("\n💡 提示:");
    console.log("  1. 启动清算机器人: npm run bot:liquidation");
    console.log("  2. 启动再平衡机器人: npm run bot:rebalance");
    console.log("  3. 测试杠杆开仓: npm run interact:leverage\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 部署失败:", error);
        process.exit(1);
    });