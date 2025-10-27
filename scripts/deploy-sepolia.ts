// scripts/deploy-sepolia.ts
import { ethers, upgrades } from "hardhat";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

interface DeploymentAddresses {
    network: string;
    timestamp: number;
    deployer: string;
    contracts: {
        [key: string]: string;
    };
    verification: {
        [key: string]: {
            address: string;
            constructorArgs: any[];
        };
    };
    status: {
        completed: boolean;
        lastStep: number;
        error?: string;
    };
}

// 保存部署进度
function saveDeployment(deployment: DeploymentAddresses) {
    const deploymentsDir = join(__dirname, "../deployments");
    mkdirSync(deploymentsDir, { recursive: true });

    const latestFile = join(deploymentsDir, "sepolia.json");
    writeFileSync(latestFile, JSON.stringify(deployment, null, 2));
}

// 加载已有部署
function loadDeployment(): DeploymentAddresses | null {
    const deploymentsDir = join(__dirname, "../deployments");
    const latestFile = join(deploymentsDir, "sepolia.json");

    if (existsSync(latestFile)) {
        try {
            const data = readFileSync(latestFile, "utf8");
            return JSON.parse(data);
        } catch (error) {
            console.log("⚠️  无法读取已有部署，将重新部署");
            return null;
        }
    }
    return null;
}

// 等待交易确认的辅助函数
async function waitForTx(tx: any, description: string) {
    console.log(`   ⏳ 等待交易确认: ${description}...`);
    const receipt = await tx.wait();
    console.log(`   ✅ 已确认 (Gas: ${receipt.gasUsed.toString()})`);
    return receipt;
}

// 部署合约的辅助函数
async function deployContract(
    contractFactory: any,
    args: any[],
    name: string,
    deployment: DeploymentAddresses
): Promise<string> {
    console.log(`   📦 部署 ${name}...`);

    // 估算 gas
    const deployTx = await contractFactory.getDeployTransaction(...args);
    const estimatedGas = await ethers.provider.estimateGas(deployTx);
    console.log(`   💡 预估 Gas: ${estimatedGas.toString()}`);

    const contract = await contractFactory.deploy(...args);
    await contract.waitForDeployment();
    const address = await contract.getAddress();

    deployment.contracts[name] = address;
    deployment.verification[name] = {
        address,
        constructorArgs: args
    };

    console.log(`   ✅ ${name} 部署成功: ${address}`);
    saveDeployment(deployment);

    return address;
}

async function main() {
    console.log("🚀 开始部署到 Sepolia 测试网...\n");

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const balance = await ethers.provider.getBalance(deployerAddress);

    console.log("📍 部署账户:", deployerAddress);
    console.log("💰 账户余额:", ethers.formatEther(balance), "ETH");

    // 检查网络
    const network = await ethers.provider.getNetwork();
    console.log("🌐 网络:", network.name, "Chain ID:", network.chainId);
    console.log("");

    // 降低余额要求
    const minBalance = ethers.parseEther("0.05");
    if (balance < minBalance) {
        console.log("⚠️  余额较低 (需要至少 0.05 ETH)");
        console.log("💡 建议从以下水龙头获取测试 ETH:");
        console.log("   1. https://sepoliafaucet.com/");
        console.log("   2. https://faucet.quicknode.com/ethereum/sepolia");
        console.log("   3. https://faucets.chain.link/sepolia");
        console.log(`   你的地址: ${deployerAddress}\n`);

        if (balance < ethers.parseEther("0.02")) {
            throw new Error("❌ 余额严重不足，无法部署");
        }
        console.log("⚠️  余额偏低但尝试继续...\n");
    }

    // 获取 gas 价格
    const feeData = await ethers.provider.getFeeData();
    console.log("⛽ Gas 价格:", ethers.formatUnits(feeData.gasPrice || 0n, "gwei"), "Gwei");
    console.log("");

    // 加载或创建部署记录
    let deployment = loadDeployment();
    if (deployment && !deployment.status.completed) {
        console.log("📂 发现未完成的部署，从步骤", deployment.status.lastStep + 1, "继续...\n");
    } else {
        deployment = {
            network: "sepolia",
            timestamp: Date.now(),
            deployer: deployerAddress,
            contracts: {},
            verification: {},
            status: {
                completed: false,
                lastStep: 0
            }
        };
    }

    try {
        // ==========================================
        // 步骤 1: 部署基础代币
        // ==========================================
        if (deployment.status.lastStep < 1) {
            console.log("1️⃣ 部署测试代币...\n");

            const MockERC20 = await ethers.getContractFactory("MockERC20");

            if (!deployment.contracts.USDC) {
                await deployContract(MockERC20, ["USD Coin", "USDC", 6], "USDC", deployment);
            }

            if (!deployment.contracts.DAI) {
                await deployContract(MockERC20, ["Dai Stablecoin", "DAI", 18], "DAI", deployment);
            }

            if (!deployment.contracts.WETH) {
                await deployContract(MockERC20, ["Wrapped Ether", "WETH", 18], "WETH", deployment);
            }

            deployment.status.lastStep = 1;
            saveDeployment(deployment);
            console.log("✅ 步骤 1 完成\n");
        } else {
            console.log("⏭️  跳过步骤 1 (已完成)\n");
        }

        // ==========================================
        // 步骤 2: 部署预言机系统
        // ==========================================
        if (deployment.status.lastStep < 2) {
            console.log("2️⃣ 部署预言机系统...\n");

            const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
            const priceOracleAddress = await deployContract(
                ChainlinkPriceOracle,
                [],
                "PriceOracle",
                deployment
            );

            // 配置价格源
            const priceOracle = await ethers.getContractAt("ChainlinkPriceOracle", priceOracleAddress);

            const SEPOLIA_CHAINLINK_FEEDS = {
                ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
                USDC_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
                DAI_USD: "0x14866185B1962B63C3Ea9E03Bc1da838bab34C19"
            };

            console.log("   🔧 配置价格源...");
            try {
                await waitForTx(
                    await priceOracle.addPriceFeed(deployment.contracts.WETH!, SEPOLIA_CHAINLINK_FEEDS.ETH_USD, 3600),
                    "ETH/USD"
                );
                await waitForTx(
                    await priceOracle.addPriceFeed(deployment.contracts.USDC!, SEPOLIA_CHAINLINK_FEEDS.USDC_USD, 3600),
                    "USDC/USD"
                );
                await waitForTx(
                    await priceOracle.addPriceFeed(deployment.contracts.DAI!, SEPOLIA_CHAINLINK_FEEDS.DAI_USD, 3600),
                    "DAI/USD"
                );
            } catch (error: any) {
                console.log("   ⚠️  价格源配置失败:", error.message.substring(0, 100));
            }

            deployment.status.lastStep = 2;
            saveDeployment(deployment);
            console.log("✅ 步骤 2 完成\n");
        } else {
            console.log("⏭️  跳过步骤 2 (已完成)\n");
        }

        // ==========================================
        // 步骤 3: 部署费用系统
        // ==========================================
        if (deployment.status.lastStep < 3) {
            console.log("3️⃣ 部署费用系统...\n");

            const treasury = deployerAddress;
            const FeeCollector = await ethers.getContractFactory("FeeCollector");

            await deployContract(
                FeeCollector,
                [treasury, 1000, 200],
                "FeeCollector",
                deployment
            );

            deployment.status.lastStep = 3;
            saveDeployment(deployment);
            console.log("✅ 步骤 3 完成\n");
        } else {
            console.log("⏭️  跳过步骤 3 (已完成)\n");
        }

        // ==========================================
        // 步骤 4: 部署策略管理器
        // ==========================================
        if (deployment.status.lastStep < 4) {
            console.log("4️⃣ 部署策略管理器...\n");

            const StrategyManager = await ethers.getContractFactory("StrategyManager");
            await deployContract(StrategyManager, [], "StrategyManager", deployment);

            deployment.status.lastStep = 4;
            saveDeployment(deployment);
            console.log("✅ 步骤 4 完成\n");
        } else {
            console.log("⏭️  跳过步骤 4 (已完成)\n");
        }

        // ==========================================
        // 步骤 5: 部署 Vault (可升级) - 修正版
        // ==========================================
        if (deployment.status.lastStep < 5) {
            console.log("5️⃣ 部署 Vault (可升级)...\n");

            // 检查 Vault 合约是否存在
            console.log("   🔍 检查 Vault 合约...");
            const Vault = await ethers.getContractFactory("Vault");

            // 获取初始化函数的签名
            const initializeFragment = Vault.interface.getFunction("initialize");
            if (!initializeFragment) {
                throw new Error("❌ Vault 合约没有 initialize 函数");
            }

            console.log(`   📝 Initialize 函数签名: ${initializeFragment.format()}`);
            console.log(`   📝 参数数量: ${initializeFragment.inputs.length}`);

            // 根据实际的 initialize 函数参数进行部署
            console.log("   📦 部署 Vault Proxy...");

            let vault;
            try {
                // 方案 1: 尝试使用完整参数部署
                vault = await upgrades.deployProxy(
                    Vault,
                    [
                        deployment.contracts.USDC!,
                        "Aggregator USDC Vault",
                        "aggUSDC",
                        deployment.contracts.FeeCollector!,
                        deployment.contracts.StrategyManager!
                    ],
                    {
                        kind: "uups",
                        initializer: "initialize"
                    }
                );
            } catch (error: any) {
                console.log("   ⚠️  使用 5 参数部署失败，尝试其他方案...");

                try {
                    // 方案 2: 尝试不使用 initializer 参数
                    vault = await upgrades.deployProxy(
                        Vault,
                        [
                            deployment.contracts.USDC!,
                            "Aggregator USDC Vault",
                            "aggUSDC",
                            deployment.contracts.FeeCollector!,
                            deployment.contracts.StrategyManager!
                        ],
                        {
                            kind: "uups"
                        }
                    );
                } catch (error2: any) {
                    console.log("   ⚠️  方案 2 失败，尝试不带参数部署...");

                    // 方案 3: 先部署空代理，然后手动初始化
                    vault = await upgrades.deployProxy(
                        Vault,
                        [],
                        {
                            kind: "uups",
                            initializer: false
                        }
                    );

                    console.log("   🔧 手动初始化 Vault...");
                    await vault.waitForDeployment();
                    const vaultAddress = await vault.getAddress();

                    const vaultContract = await ethers.getContractAt("Vault", vaultAddress);

                    // 检查是否有 initialize 函数
                    if (typeof (vaultContract as any).initialize === 'function') {
                        const tx = await (vaultContract as any).initialize(
                            deployment.contracts.USDC!,
                            "Aggregator USDC Vault",
                            "aggUSDC",
                            deployment.contracts.FeeCollector!,
                            deployment.contracts.StrategyManager!
                        );
                        await tx.wait();
                        console.log("   ✅ 手动初始化完成");
                    } else {
                        console.log("   ⚠️  没有 initialize 函数，跳过初始化");
                    }
                }
            }

            await vault.waitForDeployment();
            const vaultAddress = await vault.getAddress();
            deployment.contracts.Vault = vaultAddress;

            // 获取实现合约地址
            try {
                const implementationAddress = await upgrades.erc1967.getImplementationAddress(vaultAddress);
                deployment.contracts.VaultImplementation = implementationAddress;
                console.log("   📝 Implementation:", implementationAddress);
            } catch (error) {
                console.log("   ⚠️  无法获取实现合约地址");
            }

            deployment.verification.Vault = {
                address: vaultAddress,
                constructorArgs: []
            };

            console.log("   ✅ Vault Proxy:", vaultAddress);

            deployment.status.lastStep = 5;
            saveDeployment(deployment);
            console.log("✅ 步骤 5 完成\n");
        } else {
            console.log("⏭️  跳过步骤 5 (已完成)\n");
        }

        // ==========================================
        // 步骤 6: 部署 Mock 策略
        // ==========================================
        if (deployment.status.lastStep < 6) {
            console.log("6️⃣ 部署 Mock 策略...\n");

            const MockAaveStrategy = await ethers.getContractFactory("MockAaveStrategy");
            await deployContract(
                MockAaveStrategy,
                [deployment.contracts.Vault!, deployment.contracts.USDC!, 500],
                "AaveStrategy",
                deployment
            );

            const MockCurveStrategy = await ethers.getContractFactory("MockCurveStrategy");
            await deployContract(
                MockCurveStrategy,
                [deployment.contracts.Vault!, deployment.contracts.USDC!, 800],
                "CurveStrategy",
                deployment
            );

            deployment.status.lastStep = 6;
            saveDeployment(deployment);
            console.log("✅ 步骤 6 完成\n");
        } else {
            console.log("⏭️  跳过步骤 6 (已完成)\n");
        }

        // ==========================================
        // 步骤 7: 配置策略
        // ==========================================
        if (deployment.status.lastStep < 7) {
            console.log("7️⃣ 配置策略...\n");

            const strategyManager = await ethers.getContractAt(
                "StrategyManager",
                deployment.contracts.StrategyManager!
            );
            const vault = await ethers.getContractAt("Vault", deployment.contracts.Vault!);

            console.log("   🔧 添加 Aave 策略...");
            try {
                await waitForTx(
                    await strategyManager.addStrategy(
                        deployment.contracts.AaveStrategy!,
                        4000,
                        100,
                        deployment.contracts.Vault!
                    ),
                    "添加 Aave 策略"
                );
            } catch (error: any) {
                console.log("   ⚠️  添加策略失败:", error.message.substring(0, 100));
            }

            console.log("   🔧 添加 Curve 策略...");
            try {
                await waitForTx(
                    await strategyManager.addStrategy(
                        deployment.contracts.CurveStrategy!,
                        6000,
                        100,
                        deployment.contracts.Vault!
                    ),
                    "添加 Curve 策略"
                );
            } catch (error: any) {
                console.log("   ⚠️  添加策略失败:", error.message.substring(0, 100));
            }

            console.log("   🔧 关联 StrategyManager...");
            try {
                await waitForTx(
                    await vault.setStrategyManager(deployment.contracts.StrategyManager!),
                    "设置 StrategyManager"
                );
            } catch (error: any) {
                console.log("   ⚠️  设置失败:", error.message.substring(0, 100));
            }

            deployment.status.lastStep = 7;
            saveDeployment(deployment);
            console.log("✅ 步骤 7 完成\n");
        } else {
            console.log("⏭️  跳过步骤 7 (已完成)\n");
        }

        // ==========================================
        // 步骤 8: 部署元交易系统
        // ==========================================
        if (deployment.status.lastStep < 8) {
            console.log("8️⃣ 部署元交易系统...\n");

            const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
            await deployContract(MetaTxForwarder, [], "MetaTxForwarder", deployment);

            const RelayerRegistry = await ethers.getContractFactory("RelayerRegistry");
            await deployContract(RelayerRegistry, [], "RelayerRegistry", deployment);

            deployment.status.lastStep = 8;
            saveDeployment(deployment);
            console.log("✅ 步骤 8 完成\n");
        } else {
            console.log("⏭️  跳过步骤 8 (已完成)\n");
        }

        // ==========================================
        // 步骤 9: 部署杠杆系统
        // ==========================================
        if (deployment.status.lastStep < 9) {
            console.log("9️⃣ 部署杠杆系统...\n");

            const AAVE_POOL_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
            const UNISWAP_ROUTER_SEPOLIA = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";

            const LeverageHelper = await ethers.getContractFactory("LeverageHelper");
            const leverageHelperAddress = await deployContract(
                LeverageHelper,
                [AAVE_POOL_SEPOLIA, UNISWAP_ROUTER_SEPOLIA, deployment.contracts.PriceOracle!],
                "LeverageHelper",
                deployment
            );

            const leverageHelper = await ethers.getContractAt("LeverageHelper", leverageHelperAddress);

            console.log("   🔧 配置抵押品和借贷资产...");
            try {
                await waitForTx(
                    await leverageHelper.addCollateral(deployment.contracts.WETH!, 8000, 8500, 105),
                    "添加 WETH 抵押品"
                );
                await waitForTx(
                    await leverageHelper.addBorrowAsset(deployment.contracts.USDC!, 300),
                    "添加 USDC 借贷"
                );
                await waitForTx(
                    await leverageHelper.addBorrowAsset(deployment.contracts.DAI!, 300),
                    "添加 DAI 借贷"
                );
            } catch (error: any) {
                console.log("   ⚠️  配置失败:", error.message.substring(0, 100));
            }

            deployment.status.lastStep = 9;
            saveDeployment(deployment);
            console.log("✅ 步骤 9 完成\n");
        } else {
            console.log("⏭️  跳过步骤 9 (已完成)\n");
        }

        // ==========================================
        // 步骤 10: 部署自动化机器人
        // ==========================================
        if (deployment.status.lastStep < 10) {
            console.log("🔟 部署自动化机器人...\n");

            const UNISWAP_ROUTER_SEPOLIA = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";

            const LiquidationBot = await ethers.getContractFactory("LiquidationBot");
            await deployContract(
                LiquidationBot,
                [deployment.contracts.LeverageHelper!, UNISWAP_ROUTER_SEPOLIA],
                "LiquidationBot",
                deployment
            );

            const RebalanceBot = await ethers.getContractFactory("RebalanceBot");
            await deployContract(
                RebalanceBot,
                [deployment.contracts.LeverageHelper!],
                "RebalanceBot",
                deployment
            );

            const HarvestBot = await ethers.getContractFactory("HarvestBot");
            await deployContract(
                HarvestBot,
                [deployment.contracts.Vault!],
                "HarvestBot",
                deployment
            );

            deployment.status.lastStep = 10;
            saveDeployment(deployment);
            console.log("✅ 步骤 10 完成\n");
        } else {
            console.log("⏭️  跳过步骤 10 (已完成)\n");
        }

        // ==========================================
        // 步骤 11: 初始化测试数据
        // ==========================================
        if (deployment.status.lastStep < 11) {
            console.log("1️⃣1️⃣ 初始化测试数据...\n");

            const usdc = await ethers.getContractAt("MockERC20", deployment.contracts.USDC!);
            const dai = await ethers.getContractAt("MockERC20", deployment.contracts.DAI!);
            const weth = await ethers.getContractAt("MockERC20", deployment.contracts.WETH!);

            console.log("   🪙 铸造测试代币...");
            await waitForTx(
                await usdc.mint(deployerAddress, ethers.parseUnits("100000", 6)),
                "铸造 USDC"
            );
            await waitForTx(
                await dai.mint(deployerAddress, ethers.parseEther("100000")),
                "铸造 DAI"
            );
            await waitForTx(
                await weth.mint(deployerAddress, ethers.parseEther("100")),
                "铸造 WETH"
            );

            console.log("   💧 提供策略流动性...");
            await waitForTx(
                await usdc.mint(deployment.contracts.AaveStrategy!, ethers.parseUnits("1000000", 6)),
                "Aave 策略流动性"
            );
            await waitForTx(
                await usdc.mint(deployment.contracts.CurveStrategy!, ethers.parseUnits("1000000", 6)),
                "Curve 策略流动性"
            );

            deployment.status.lastStep = 11;
            saveDeployment(deployment);
            console.log("✅ 步骤 11 完成\n");
        } else {
            console.log("⏭️  跳过步骤 11 (已完成)\n");
        }

        // ==========================================
        // 完成部署
        // ==========================================
        deployment.status.completed = true;
        saveDeployment(deployment);

        // ==========================================
        // 生成验证脚本
        // ==========================================
        console.log("1️⃣2️⃣ 生成验证脚本...\n");

        const deploymentsDir = join(__dirname, "../deployments");
        let verifyScript = "#!/bin/bash\n\n";
        verifyScript += "# Etherscan 验证脚本\n";
        verifyScript += "# 运行前确保设置: export ETHERSCAN_API_KEY=your_key\n\n";

        for (const [name, info] of Object.entries(deployment.verification)) {
            if (name === "Vault") continue;

            verifyScript += `echo "验证 ${name}..."\n`;
            verifyScript += `npx hardhat verify --network sepolia ${info.address}`;
            if (info.constructorArgs.length > 0) {
                verifyScript += ` ${info.constructorArgs.map(arg =>
                    typeof arg === 'string' ? `"${arg}"` : arg
                ).join(' ')}`;
            }
            verifyScript += "\nif [ $? -ne 0 ]; then\n";
            verifyScript += `  echo "⚠️  ${name} 验证失败"\nfi\n\n`;
        }

        const verifyScriptFile = join(deploymentsDir, "verify-sepolia.sh");
        writeFileSync(verifyScriptFile, verifyScript);
        console.log("   ✅ 验证脚本已保存\n");

        // ==========================================
        // 打印摘要
        // ==========================================
        const finalBalance = await ethers.provider.getBalance(deployerAddress);
        const gasUsed = balance - finalBalance;

        console.log("\n" + "=".repeat(80));
        console.log("🎉 部署成功完成！");
        console.log("=".repeat(80));

        console.log("\n📊 部署统计:");
        console.log(`   Gas 使用: ${ethers.formatEther(gasUsed)} ETH`);
        console.log(`   剩余余额: ${ethers.formatEther(finalBalance)} ETH`);
        console.log(`   合约数量: ${Object.keys(deployment.contracts).length}`);

        console.log("\n📋 核心合约:");
        const coreContracts = ["Vault", "StrategyManager", "FeeCollector", "PriceOracle"];
        for (const name of coreContracts) {
            if (deployment.contracts[name]) {
                console.log(`   ${name.padEnd(20)} ${deployment.contracts[name]}`);
            }
        }

        console.log("\n🪙 测试代币:");
        const tokens = ["USDC", "DAI", "WETH"];
        for (const name of tokens) {
            if (deployment.contracts[name]) {
                console.log(`   ${name.padEnd(20)} ${deployment.contracts[name]}`);
            }
        }

        console.log("\n🔗 区块浏览器:");
        console.log(`   Vault: https://sepolia.etherscan.io/address/${deployment.contracts.Vault}`);
        console.log(`   所有合约: https://sepolia.etherscan.io/address/${deployerAddress}#internaltx`);

        console.log("\n📝 后续步骤:");
        console.log("   1. 验证合约:");
        console.log(`      bash ${verifyScriptFile}`);
        console.log("   2. 运行测试:");
        console.log("      npx hardhat run scripts/test-deployment.ts --network sepolia");
        console.log("   3. 查看部署信息:");
        console.log(`      cat deployments/sepolia.json`);
        console.log("");

    } catch (error: any) {
        deployment.status.error = error.message;
        saveDeployment(deployment);

        console.error("\n❌ 部署失败于步骤", deployment.status.lastStep);
        console.error("错误:", error.message);
        console.error("\n💡 提示:");
        console.error("   1. 检查 Vault 合约的 initialize 函数签名");
        console.error("   2. 确保合约已编译: npx hardhat compile");
        console.error("   3. 再次运行脚本将从失败的步骤继续");
        console.error("   4. 如需重新开始，删除 deployments/sepolia.json\n");

        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });