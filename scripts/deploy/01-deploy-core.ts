// scripts/deploy/01-deploy-core.ts
import { ethers, upgrades } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

interface DeployedContracts {
    vault: string;
    strategyManager: string;
    feeCollector: string;
    priceOracle: string;
    emergencyStop: string;
    accessControl: string;
    insuranceFund: string;
    principalToken?: string;
    yieldToken?: string;
}

async function main() {
    console.log("🚀 开始部署核心系统...\n");

    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);
    console.log("账户余额:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH\n");

    const deployedContracts: DeployedContracts = {} as DeployedContracts;

    // ==========================================
    // 1. 部署安全组件 (模块五)
    // ==========================================
    console.log("📌 步骤 1: 部署安全组件");

    // 1.1 紧急停止合约
    console.log("  部署 EmergencyStop...");
    const EmergencyStop = await ethers.getContractFactory("EmergencyStop");
    const emergencyStop = await EmergencyStop.deploy();
    await emergencyStop.waitForDeployment();
    deployedContracts.emergencyStop = await emergencyStop.getAddress();
    console.log("  ✅ EmergencyStop:", deployedContracts.emergencyStop);

    // 1.2 高级访问控制
    console.log("  部署 AdvancedAccessControl...");
    const AccessControl = await ethers.getContractFactory("AdvancedAccessControl");
    const accessControl = await AccessControl.deploy();
    await accessControl.waitForDeployment();
    deployedContracts.accessControl = await accessControl.getAddress();
    console.log("  ✅ AccessControl:", deployedContracts.accessControl);

    // 1.3 保险基金
    console.log("  部署 InsuranceFund...");
    const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
    const insuranceFund = await InsuranceFund.deploy();
    await insuranceFund.waitForDeployment();
    deployedContracts.insuranceFund = await insuranceFund.getAddress();
    console.log("  ✅ InsuranceFund:", deployedContracts.insuranceFund, "\n");

    // ==========================================
    // 2. 部署价格预言机
    // ==========================================
    console.log("📌 步骤 2: 部署价格预言机");

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();
    deployedContracts.priceOracle = await priceOracle.getAddress();
    console.log("  ✅ PriceOracle:", deployedContracts.priceOracle);

    // 配置价格源
    const CHAINLINK_ETH_USD = process.env.CHAINLINK_ETH_USD || "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
    await priceOracle.addPriceFeed(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
        CHAINLINK_ETH_USD,
        0 // Chainlink
    );
    console.log("  ✅ 已配置 ETH/USD 价格源\n");

    // ==========================================
    // 3. 部署费用收集器
    // ==========================================
    console.log("📌 步骤 3: 部署费用收集器");

    const FeeCollector = await ethers.getContractFactory("FeeCollector");
    const feeCollector = await FeeCollector.deploy(
        await deployer.getAddress(), // treasury
        1000, // performanceFee: 10%
        200   // managementFee: 2%
    );
    await feeCollector.waitForDeployment();
    deployedContracts.feeCollector = await feeCollector.getAddress();
    console.log("  ✅ FeeCollector:", deployedContracts.feeCollector, "\n");

    // ==========================================
    // 4. 部署策略管理器
    // ==========================================
    console.log("📌 步骤 4: 部署策略管理器");

    const StrategyManager = await ethers.getContractFactory("StrategyManager");
    const strategyManager = await StrategyManager.deploy();
    await strategyManager.waitForDeployment();
    deployedContracts.strategyManager = await strategyManager.getAddress();
    console.log("  ✅ StrategyManager:", deployedContracts.strategyManager, "\n");

    // ==========================================
    // 5. 部署主金库 (可升级)
    // ==========================================
    console.log("📌 步骤 5: 部署主金库 (UUPS 代理)");

    const USDC = process.env.USDC_ADDRESS || "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await upgrades.deployProxy(
        Vault,
        [
            USDC,                              // 底层资产
            "Aggregator USDC Vault",           // 名称
            "aggUSDC",                         // 符号
            deployedContracts.feeCollector     // 国库地址
        ],
        { kind: "uups" }
    );
    await vault.waitForDeployment();
    deployedContracts.vault = await vault.getAddress();
    console.log("  ✅ Vault (Proxy):", deployedContracts.vault, "\n");

    // ==========================================
    // 6. 部署策略合约
    // ==========================================
    console.log("📌 步骤 6: 部署示例策略");

    // 6.1 Aave V3 策略
    console.log("  部署 AaveStrategy...");
    const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
    const aaveStrategy = await AaveStrategy.deploy(
        USDC,
        deployedContracts.vault,
        process.env.AAVE_V3_POOL || "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
    );
    await aaveStrategy.waitForDeployment();
    const aaveStrategyAddress = await aaveStrategy.getAddress();
    console.log("  ✅ AaveStrategy:", aaveStrategyAddress);

    // 6.2 Compound V3 策略
    console.log("  部署 CompoundStrategy...");
    const CompoundStrategy = await ethers.getContractFactory("CompoundStrategy");
    const compoundStrategy = await CompoundStrategy.deploy(
        USDC,
        deployedContracts.vault,
        process.env.COMPOUND_V3_COMET || "0xc3d688B66703497DAA19211EEdff47f25384cdc3"
    );
    await compoundStrategy.waitForDeployment();
    const compoundStrategyAddress = await compoundStrategy.getAddress();
    console.log("  ✅ CompoundStrategy:", compoundStrategyAddress, "\n");

    // ==========================================
    // 7. 连接组件
    // ==========================================
    console.log("📌 步骤 7: 配置系统连接");

    // 7.1 添加策略到金库
    console.log("  添加策略到金库...");
    await vault.addStrategy(aaveStrategyAddress, 5000); // 50% 分配
    await vault.addStrategy(compoundStrategyAddress, 5000); // 50% 分配
    console.log("  ✅ 策略已添加到金库");

    // 7.2 授予权限
    console.log("  配置权限...");
    const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
    await accessControl.grantRole(OPERATOR_ROLE, deployedContracts.vault);
    console.log("  ✅ 权限配置完成\n");

    // ==========================================
    // 8. 部署收益分割代币 (可选)
    // ==========================================
    if (process.env.DEPLOY_YIELD_TOKENS === "true") {
        console.log("📌 步骤 8: 部署收益分割代币");

        const maturity = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1年后

        // 8.1 本金代币
        const PrincipalToken = await ethers.getContractFactory("PrincipalToken");
        const principalToken = await PrincipalToken.deploy(
            "Principal USDC 2025",
            "PT-USDC-2025",
            USDC,
            deployedContracts.vault,
            maturity
        );
        await principalToken.waitForDeployment();
        deployedContracts.principalToken = await principalToken.getAddress();
        console.log("  ✅ PrincipalToken:", deployedContracts.principalToken);

        // 8.2 收益代币
        const YieldToken = await ethers.getContractFactory("YieldToken");
        const yieldToken = await YieldToken.deploy(
            "Yield USDC 2025",
            "YT-USDC-2025",
            USDC,
            deployedContracts.vault,
            maturity
        );
        await yieldToken.waitForDeployment();
        deployedContracts.yieldToken = await yieldToken.getAddress();
        console.log("  ✅ YieldToken:", deployedContracts.yieldToken);

        // 关联PT和YT
        await principalToken.setYieldToken(deployedContracts.yieldToken);
        await yieldToken.setPrincipalToken(deployedContracts.principalToken);
        console.log("  ✅ PT/YT 已关联\n");
    }

    // ==========================================
    // 9. 保存部署信息
    // ==========================================
    console.log("📌 步骤 9: 保存部署信息");

    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: deployedContracts,
        strategies: {
            aave: aaveStrategyAddress,
            compound: compoundStrategyAddress
        }
    };

    const deploymentsDir = join(__dirname, "../../deployments");
    if (!existsSync(deploymentsDir)) {
        mkdirSync(deploymentsDir, { recursive: true });
    }

    const filename = join(deploymentsDir, `core-${deploymentInfo.network}.json`);
    writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log("  ✅ 部署信息已保存:", filename, "\n");

    // ==========================================
    // 10. 验证部署
    // ==========================================
    console.log("📌 步骤 10: 验证部署");

    const vaultAssets = await vault.totalAssets();
    console.log("  金库总资产:", ethers.formatUnits(vaultAssets, 6), "USDC");

    const strategyCount = (await vault.strategies()).length;
    console.log("  策略数量:", strategyCount);

    console.log("\n✅ 核心系统部署完成！\n");
    console.log("=" .repeat(60));
    console.log("📝 重要地址:");
    console.log("=" .repeat(60));
    Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`${name.padEnd(20)}: ${address}`);
    });
    console.log("=" .repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 部署失败:", error);
        process.exit(1);
    });