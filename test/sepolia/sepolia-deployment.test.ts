import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentAddresses {
    [key: string]: string;
}

async function main() {
    console.log("🚀 开始部署 DeFi Aggregator 到 Sepolia 测试网...\n");

    const [deployer] = await ethers.getSigners();
    console.log("📍 部署账户:", deployer.address);
    console.log("💰 账户余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

    const deployedAddresses: DeploymentAddresses = {};

    try {
        console.log("📦 步骤 1: 部署 Mock 合约...");

        const MockERC20 = await ethers.getContractFactory("MockERC20");

        console.log("  - 部署 USDC...");
        const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();
        deployedAddresses.mockUSDC = await mockUSDC.getAddress();
        console.log("    ✅ USDC:", deployedAddresses.mockUSDC);

        console.log("  - 部署 DAI...");
        const mockDAI = await MockERC20.deploy("Mock DAI", "DAI", 18);
        await mockDAI.waitForDeployment();
        deployedAddresses.mockDAI = await mockDAI.getAddress();
        console.log("    ✅ DAI:", deployedAddresses.mockDAI);

        console.log("  - 部署 USDT...");
        const mockUSDT = await MockERC20.deploy("Mock USDT", "USDT", 6);
        await mockUSDT.waitForDeployment();
        deployedAddresses.mockUSDT = await mockUSDT.getAddress();
        console.log("    ✅ USDT:", deployedAddresses.mockUSDT);

        console.log("  - 部署 MockUniswapRouter...");
        const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
        const mockRouter = await MockUniswapRouter.deploy();
        await mockRouter.waitForDeployment();
        deployedAddresses.mockRouter = await mockRouter.getAddress();
        console.log("    ✅ MockRouter:", deployedAddresses.mockRouter);

        console.log("  - 部署 MockAavePool...");
        const MockAavePool = await ethers.getContractFactory("MockAavePool");
        const mockAavePool = await MockAavePool.deploy();
        await mockAavePool.waitForDeployment();
        deployedAddresses.mockAavePool = await mockAavePool.getAddress();
        console.log("    ✅ MockAavePool:", deployedAddresses.mockAavePool);

        console.log("  - 部署 MockAToken...");
        const mockAToken = await MockERC20.deploy("Mock aUSDC", "aUSDC", 6);
        await mockAToken.waitForDeployment();
        deployedAddresses.mockAToken = await mockAToken.getAddress();
        console.log("    ✅ MockAToken:", deployedAddresses.mockAToken);

        console.log("  - 部署 ChainlinkPriceOracle...");
        const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
        const priceOracle = await ChainlinkPriceOracle.deploy();
        await priceOracle.waitForDeployment();
        deployedAddresses.priceOracle = await priceOracle.getAddress();
        console.log("    ✅ PriceOracle:", deployedAddresses.priceOracle);

        console.log("\n✅ Mock 合约部署完成!\n");

        console.log("📦 步骤 2: 部署核心合约...");

        console.log("  - 部署 VaultFactory...");
        const VaultFactory = await ethers.getContractFactory("VaultFactory");
        const vaultFactory = await VaultFactory.deploy(deployer.address);
        await vaultFactory.waitForDeployment();
        deployedAddresses.vaultFactory = await vaultFactory.getAddress();
        console.log("    ✅ VaultFactory:", deployedAddresses.vaultFactory);

        console.log("  - 部署 StrategyManager (Upgradeable)...");
        const StrategyManager = await ethers.getContractFactory("StrategyManager");
        const strategyManager = await upgrades.deployProxy(
            StrategyManager,
            [deployer.address],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        await strategyManager.waitForDeployment();
        deployedAddresses.strategyManager = await strategyManager.getAddress();
        console.log("    ✅ StrategyManager:", deployedAddresses.strategyManager);

        console.log("\n✅ 核心合约部署完成!\n");

        console.log("📦 步骤 3: 创建测试 Vault...");

        console.log("  - 通过 VaultFactory 创建 USDC Vault...");
        const createVaultTx = await vaultFactory.createVault(
            deployedAddresses.mockUSDC,
            "USDC Yield Vault",
            "yvUSDC",
            deployedAddresses.strategyManager
        );
        await createVaultTx.wait();

        const allVaults = await vaultFactory.getAllVaults();
        const usdcVault = allVaults[allVaults.length - 1];
        deployedAddresses.usdcVault = usdcVault;
        console.log("    ✅ USDC Vault:", usdcVault);

        console.log("\n✅ Vault 创建完成!\n");

        console.log("📦 步骤 4: 部署策略合约 (Upgradeable)...");

        try {
            console.log("  - 部署 AaveStrategy...");
            const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
            const aaveStrategy = await upgrades.deployProxy(
                AaveStrategy,
                [
                    deployedAddresses.usdcVault,
                    deployedAddresses.mockUSDC,
                    deployedAddresses.mockAavePool,
                    deployedAddresses.mockAToken
                ],
                {
                    initializer: "initialize",
                    kind: "uups"
                }
            );
            await aaveStrategy.waitForDeployment();
            deployedAddresses.aaveStrategy = await aaveStrategy.getAddress();
            console.log("    ✅ AaveStrategy:", deployedAddresses.aaveStrategy);
        } catch (error: any) {
            console.log("    ⚠️ AaveStrategy 部署失败，跳过:", error.message);
        }

        try {
            console.log("  - 部署 CompoundStrategy...");
            const CompoundStrategy = await ethers.getContractFactory("CompoundStrategy");
            const compoundStrategy = await upgrades.deployProxy(
                CompoundStrategy,
                [
                    deployedAddresses.usdcVault,
                    deployedAddresses.mockUSDC,
                    deployedAddresses.mockAavePool
                ],
                {
                    initializer: "initialize",
                    kind: "uups"
                }
            );
            await compoundStrategy.waitForDeployment();
            deployedAddresses.compoundStrategy = await compoundStrategy.getAddress();
            console.log("    ✅ CompoundStrategy:", deployedAddresses.compoundStrategy);
        } catch (error: any) {
            console.log("    ⚠️ CompoundStrategy 部署失败，跳过:", error.message);
        }

        try {
            console.log("  - 部署 CurveStrategy...");
            const CurveStrategy = await ethers.getContractFactory("CurveStrategy");
            const curveStrategy = await upgrades.deployProxy(
                CurveStrategy,
                [
                    deployedAddresses.usdcVault,
                    deployedAddresses.mockUSDC,
                    deployedAddresses.mockRouter,
                    deployedAddresses.mockAavePool,
                    deployedAddresses.mockAavePool,
                    0,
                    deployedAddresses.mockUSDC,
                    deployedAddresses.mockDAI,
                    deployedAddresses.mockUSDT
                ],
                {
                    initializer: "initialize",
                    kind: "uups"
                }
            );
            await curveStrategy.waitForDeployment();
            deployedAddresses.curveStrategy = await curveStrategy.getAddress();
            console.log("    ✅ CurveStrategy:", deployedAddresses.curveStrategy);
        } catch (error: any) {
            console.log("    ⚠️ CurveStrategy 部署失败，跳过:", error.message);
        }

        console.log("\n✅ 策略合约部署完成!\n");

        console.log("📦 步骤 5: 部署 Meta Transaction 合约...");

        console.log("  - 部署 MetaTxForwarder...");
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        const metaTxForwarder = await MetaTxForwarder.deploy();
        await metaTxForwarder.waitForDeployment();
        deployedAddresses.metaTxForwarder = await metaTxForwarder.getAddress();
        console.log("    ✅ MetaTxForwarder:", deployedAddresses.metaTxForwarder);

        console.log("  - 部署 GasStation...");
        const GasStation = await ethers.getContractFactory("GasStation");
        const gasStation = await GasStation.deploy();
        await gasStation.waitForDeployment();
        deployedAddresses.gasStation = await gasStation.getAddress();
        console.log("    ✅ GasStation:", deployedAddresses.gasStation);

        console.log("  - 部署 BatchExecutor...");
        const BatchExecutor = await ethers.getContractFactory("BatchExecutor");
        const batchExecutor = await BatchExecutor.deploy();
        await batchExecutor.waitForDeployment();
        deployedAddresses.batchExecutor = await batchExecutor.getAddress();
        console.log("    ✅ BatchExecutor:", deployedAddresses.batchExecutor);

        console.log("\n✅ Meta Transaction 合约部署完成!\n");

        console.log("📦 步骤 6: 部署杠杆和清算合约...");

        console.log("  - 部署 LeverageHelper...");
        const LeverageHelper = await ethers.getContractFactory("LeverageHelper");
        const leverageHelper = await LeverageHelper.deploy(
            deployedAddresses.mockAavePool,
            deployedAddresses.mockRouter,
            deployedAddresses.priceOracle
        );
        await leverageHelper.waitForDeployment();
        deployedAddresses.leverageHelper = await leverageHelper.getAddress();
        console.log("    ✅ LeverageHelper:", deployedAddresses.leverageHelper);

        console.log("  - 部署 LeverageEngine...");
        const LeverageEngine = await ethers.getContractFactory("LeverageEngine");
        const leverageEngine = await LeverageEngine.deploy(
            deployedAddresses.mockAavePool,
            deployedAddresses.mockRouter,
            deployedAddresses.usdcVault
        );
        await leverageEngine.waitForDeployment();
        deployedAddresses.leverageEngine = await leverageEngine.getAddress();
        console.log("    ✅ LeverageEngine:", deployedAddresses.leverageEngine);

        console.log("  - 部署 PositionManager...");
        const PositionManager = await ethers.getContractFactory("PositionManager");
        const positionManager = await PositionManager.deploy(
            deployedAddresses.leverageEngine
        );
        await positionManager.waitForDeployment();
        deployedAddresses.positionManager = await positionManager.getAddress();
        console.log("    ✅ PositionManager:", deployedAddresses.positionManager);

        console.log("  - 部署 LiquidationBot...");
        const LiquidationBot = await ethers.getContractFactory("LiquidationBot");
        const liquidationBot = await LiquidationBot.deploy(
            deployedAddresses.leverageHelper,
            deployedAddresses.mockRouter
        );
        await liquidationBot.waitForDeployment();
        deployedAddresses.liquidationBot = await liquidationBot.getAddress();
        console.log("    ✅ LiquidationBot:", deployedAddresses.liquidationBot);

        console.log("\n✅ 杠杆和清算合约部署完成!\n");

        console.log("📦 步骤 7: 部署跨链合约...");

        console.log("  - 部署 CrossChainBridge...");
        const CrossChainBridge = await ethers.getContractFactory("CrossChainBridge");
        const crossChainBridge = await CrossChainBridge.deploy();
        await crossChainBridge.waitForDeployment();
        deployedAddresses.crossChainBridge = await crossChainBridge.getAddress();
        console.log("    ✅ CrossChainBridge:", deployedAddresses.crossChainBridge);

        console.log("  - 部署 L2Messenger...");
        const L2Messenger = await ethers.getContractFactory("L2Messenger");
        const l2Messenger = await L2Messenger.deploy();
        await l2Messenger.waitForDeployment();
        deployedAddresses.l2Messenger = await l2Messenger.getAddress();
        console.log("    ✅ L2Messenger:", deployedAddresses.l2Messenger);

        console.log("\n✅ 跨链合约部署完成!\n");

        console.log("📦 步骤 8: 部署安全和自动化合约...");

        console.log("  - 部署 InsuranceFund...");
        const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
        const insuranceFund = await InsuranceFund.deploy();
        await insuranceFund.waitForDeployment();
        deployedAddresses.insuranceFund = await insuranceFund.getAddress();
        console.log("    ✅ InsuranceFund:", deployedAddresses.insuranceFund);

        console.log("  - 部署 EmergencyStop...");
        const EmergencyStop = await ethers.getContractFactory("EmergencyStop");
        const emergencyStop = await EmergencyStop.deploy();
        await emergencyStop.waitForDeployment();
        deployedAddresses.emergencyStop = await emergencyStop.getAddress();
        console.log("    ✅ EmergencyStop:", deployedAddresses.emergencyStop);

        console.log("\n✅ 安全和自动化合约部署完成!\n");

        console.log("📦 步骤 9: 部署 Gas 赞助合约...");

        console.log("  - 部署 GasSponsor...");
        const GasSponsor = await ethers.getContractFactory("GasSponsor");
        const gasSponsor = await GasSponsor.deploy(deployedAddresses.metaTxForwarder);
        await gasSponsor.waitForDeployment();
        deployedAddresses.gasSponsor = await gasSponsor.getAddress();
        console.log("    ✅ GasSponsor:", deployedAddresses.gasSponsor);

        console.log("  - 部署 TokenGasPayment...");
        const TokenGasPayment = await ethers.getContractFactory("TokenGasPayment");
        const tokenGasPayment = await TokenGasPayment.deploy(
            deployedAddresses.metaTxForwarder,
            deployedAddresses.mockUSDC
        );
        await tokenGasPayment.waitForDeployment();
        deployedAddresses.tokenGasPayment = await tokenGasPayment.getAddress();
        console.log("    ✅ TokenGasPayment:", deployedAddresses.tokenGasPayment);

        console.log("\n✅ Gas 赞助合约部署完成!\n");

        console.log("💾 步骤 10: 保存部署地址...");

        const deploymentsDir = path.join(__dirname, "../../deployments");
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const deploymentData = {
            network: "sepolia",
            chainId: 11155111,
            deployer: deployer.address,
            timestamp: new Date().toISOString(),
            addresses: deployedAddresses,
        };

        fs.writeFileSync(
            path.join(deploymentsDir, "sepolia.json"),
            JSON.stringify(deploymentData, null, 2)
        );

        console.log("✅ 部署地址已保存到 deployments/sepolia.json\n");

        console.log("=".repeat(60));
        console.log("🎉 部署完成！");
        console.log("=".repeat(60));
        console.log("\n📋 已部署合约列表:\n");

        Object.entries(deployedAddresses).forEach(([name, address]) => {
            console.log(`  ${name.padEnd(25)} ${address}`);
        });

        console.log("\n" + "=".repeat(60));
        console.log("📌 下一步操作:");
        console.log("  1. 验证合约部署状态");
        console.log("  2. 配置合约权限和参数");
        console.log("  3. 运行功能测试");
        console.log("=".repeat(60) + "\n");

    } catch (error) {
        console.error("\n❌ 部署失败:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });