// scripts/verify/verify-all.ts
import { run } from "hardhat";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

interface ContractInfo {
    address: string;
    constructorArgs?: any[];
}

async function verifyContract(name: string, info: ContractInfo) {
    console.log(`\n验证 ${name}...`);

    try {
        await run("verify:verify", {
            address: info.address,
            constructorArguments: info.constructorArgs || []
        });
        console.log(`✅ ${name} 验证成功`);
        return true;
    } catch (error: any) {
        if (error.message.includes("Already Verified")) {
            console.log(`✅ ${name} 已验证`);
            return true;
        }
        console.error(`❌ ${name} 验证失败:`, error.message);
        return false;
    }
}

async function main() {
    console.log("🔍 开始批量验证合约...\n");

    const network = process.env.HARDHAT_NETWORK || "sepolia";
    const deploymentsDir = join(__dirname, "../../deployments");

    // 读取所有部署文件
    const deploymentFiles = readdirSync(deploymentsDir)
        .filter(f => f.endsWith(".json") && f.includes(network));

    if (deploymentFiles.length === 0) {
        console.error(`❌ 未找到 ${network} 网络的部署文件`);
        return;
    }

    console.log(`找到 ${deploymentFiles.length} 个部署文件\n`);

    let totalContracts = 0;
    let successCount = 0;

    // 遍历所有部署文件
    for (const file of deploymentFiles) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`📄 处理文件: ${file}`);
        console.log("=".repeat(60));

        const deploymentPath = join(deploymentsDir, file);
        const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

        // 核心合约验证
        if (file.includes("core")) {
            const contracts = [
                {
                    name: "EmergencyStop",
                    address: deployment.contracts.emergencyStop,
                    args: []
                },
                {
                    name: "AdvancedAccessControl",
                    address: deployment.contracts.accessControl,
                    args: []
                },
                {
                    name: "InsuranceFund",
                    address: deployment.contracts.insuranceFund,
                    args: []
                },
                {
                    name: "PriceOracle",
                    address: deployment.contracts.priceOracle,
                    args: []
                },
                {
                    name: "FeeCollector",
                    address: deployment.contracts.feeCollector,
                    args: [
                        deployment.deployer,
                        1000,
                        200
                    ]
                },
                {
                    name: "StrategyManager",
                    address: deployment.contracts.strategyManager,
                    args: []
                }
                // Vault 是代理合约，需要特殊处理
            ];

            for (const contract of contracts) {
                totalContracts++;
                const success = await verifyContract(contract.name, {
                    address: contract.address,
                    constructorArgs: contract.args
                });
                if (success) successCount++;
            }

            // 验证策略
            if (deployment.strategies) {
                const USDC = process.env.USDC_ADDRESS || "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

                if (deployment.strategies.aave) {
                    totalContracts++;
                    const success = await verifyContract("AaveStrategy", {
                        address: deployment.strategies.aave,
                        constructorArgs: [
                            USDC,
                            deployment.contracts.vault,
                            process.env.AAVE_V3_POOL
                        ]
                    });
                    if (success) successCount++;
                }

                if (deployment.strategies.compound) {
                    totalContracts++;
                    const success = await verifyContract("CompoundStrategy", {
                        address: deployment.strategies.compound,
                        constructorArgs: [
                            USDC,
                            deployment.contracts.vault,
                            process.env.COMPOUND_V3_COMET
                        ]
                    });
                    if (success) successCount++;
                }
            }
        }

        // 元交易合约验证
        if (file.includes("metatx")) {
            const contracts = [
                {
                    name: "MetaTxForwarder",
                    address: deployment.contracts.forwarder,
                    args: []
                },
                {
                    name: "RelayHub",
                    address: deployment.contracts.relayHub,
                    args: [deployment.contracts.forwarder]
                },
                {
                    name: "GaslessVault",
                    address: deployment.contracts.gaslessVault,
                    args: [
                        process.env.USDC_ADDRESS,
                        "Gasless USDC Vault",
                        "glUSDC",
                        deployment.contracts.forwarder
                    ]
                }
            ];

            for (const contract of contracts) {
                totalContracts++;
                const success = await verifyContract(contract.name, {
                    address: contract.address,
                    constructorArgs: contract.args
                });
                if (success) successCount++;
            }
        }

        // 杠杆引擎验证
        if (file.includes("leverage")) {
            const contracts = [
                {
                    name: "LeverageHelper",
                    address: deployment.contracts.leverageHelper,
                    args: [
                        process.env.AAVE_V3_POOL,
                        process.env.UNISWAP_V3_ROUTER,
                        deployment.contracts.priceOracle
                    ]
                },
                {
                    name: "LiquidationBot",
                    address: deployment.contracts.liquidationBot,
                    args: [
                        deployment.contracts.leverageHelper,
                        process.env.AAVE_V3_POOL
                    ]
                },
                {
                    name: "RebalanceBot",
                    address: deployment.contracts.rebalanceBot,
                    args: [deployment.contracts.leverageHelper]
                },
                {
                    name: "RiskManager",
                    address: deployment.contracts.riskManager,
                    args: [deployment.contracts.priceOracle]
                }
            ];

            for (const contract of contracts) {
                totalContracts++;
                const success = await verifyContract(contract.name, {
                    address: contract.address,
                    constructorArgs: contract.args
                });
                if (success) successCount++;
            }
        }

        // 跨链桥验证
        if (file.includes("crosschain")) {
            totalContracts++;
            const success = await verifyContract("CrossChainBridge", {
                address: deployment.contracts.bridge,
                constructorArgs: []
            });
            if (success) successCount++;
        }
    }

    // 总结
    console.log("\n" + "=".repeat(60));
    console.log("📊 验证总结");
    console.log("=".repeat(60));
    console.log(`总合约数: ${totalContracts}`);
    console.log(`验证成功: ${successCount}`);
    console.log(`验证失败: ${totalContracts - successCount}`);
    console.log(`成功率: ${((successCount / totalContracts) * 100).toFixed(2)}%`);
    console.log("=".repeat(60));

    if (successCount === totalContracts) {
        console.log("\n✅ 所有合约验证完成！");
    } else {
        console.log("\n⚠️  部分合约验证失败，请检查日志");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 验证过程出错:", error);
        process.exit(1);
    });