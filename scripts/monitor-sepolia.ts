// scripts/monitor-sepolia.ts
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

interface MonitorData {
    timestamp: number;
    vault: {
        totalAssets: string;
        totalSupply: string;
        sharePrice: string;
    };
    strategies: {
        name: string;
        address: string;
        totalAssets: string;
        allocation: string;
    }[];
    leverage: {
        activePositions: number;
        totalCollateral: string;
        totalDebt: string;
    };
}

async function main() {
    console.log("🔍 Sepolia监控启动...\n");

    // 加载部署信息
    const deploymentPath = join(__dirname, "../deployments/sepolia-latest.json");
    const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

    // 连接合约
    const vault = await ethers.getContractAt("Vault", deployment.contracts.Vault);
    const strategyManager = await ethers.getContractAt(
        "StrategyManager",
        deployment.contracts.StrategyManager
    );
    const aaveStrategy = await ethers.getContractAt(
        "MockAaveStrategy",
        deployment.contracts.AaveStrategy
    );
    const curveStrategy = await ethers.getContractAt(
        "MockCurveStrategy",
        deployment.contracts.CurveStrategy
    );
    const leverageHelper = await ethers.getContractAt(
        "LeverageHelper",
        deployment.contracts.LeverageHelper
    );

    // 监控循环
    while (true) {
        try {
            const monitorData: MonitorData = {
                timestamp: Date.now(),
                vault: {
                    totalAssets: "0",
                    totalSupply: "0",
                    sharePrice: "0"
                },
                strategies: [],
                leverage: {
                    activePositions: 0,
                    totalCollateral: "0",
                    totalDebt: "0"
                }
            };

            // 1. Vault指标
            console.log("=" .repeat(80));
            console.log(`📊 Vault状态 - ${new Date().toLocaleString()}`);
            console.log("=".repeat(80));

            const totalAssets = await vault.totalAssets();
            const totalSupply = await vault.totalSupply();
            const sharePrice = totalSupply > 0n
                ? (totalAssets * ethers.parseEther("1")) / totalSupply
                : 0n;

            monitorData.vault = {
                totalAssets: ethers.formatUnits(totalAssets, 6),
                totalSupply: ethers.formatEther(totalSupply),
                sharePrice: ethers.formatEther(sharePrice)
            };

            console.log(`总资产:     ${monitorData.vault.totalAssets} USDC`);
            console.log(`总份额:     ${monitorData.vault.totalSupply}`);
            console.log(`份额价格:   ${monitorData.vault.sharePrice} USDC`);

            // 2. 策略指标
            console.log("\n📈 策略状态:");
            console.log("-".repeat(80));

            const aaveAssets = await aaveStrategy.totalAssets();
            const curveAssets = await curveStrategy.totalAssets();
            const totalStrategyAssets = aaveAssets + curveAssets;

            const strategies = [
                {
                    name: "Aave",
                    address: deployment.contracts.AaveStrategy,
                    totalAssets: ethers.formatUnits(aaveAssets, 6),
                    allocation: totalStrategyAssets > 0n
                        ? ((aaveAssets * 10000n) / totalStrategyAssets / 100n).toString() + "%"
                        : "0%"
                },
                {
                    name: "Curve",
                    address: deployment.contracts.CurveStrategy,
                    totalAssets: ethers.formatUnits(curveAssets, 6),
                    allocation: totalStrategyAssets > 0n
                        ? ((curveAssets * 10000n) / totalStrategyAssets / 100n).toString() + "%"
                        : "0%"
                }
            ];

            monitorData.strategies = strategies;

            for (const strategy of strategies) {
                console.log(`${strategy.name}:`);
                console.log(`  资产:     ${strategy.totalAssets} USDC`);
                console.log(`  分配:     ${strategy.allocation}`);
            }

            // 3. 杠杆指标
            console.log("\n💎 杠杆状态:");
            console.log("-".repeat(80));

            try {
                // 这里简化处理，实际需要遍历所有用户的仓位
                const [deployer] = await ethers.getSigners();
                let activePositions = 0;
                let totalCollateral = 0n;
                let totalDebt = 0n;

                for (let i = 0; i < 10; i++) {
                    try {
                        const position = await leverageHelper.getPosition(deployer.address, i);
                        if (position.isActive) {
                            activePositions++;
                            totalCollateral += position.collateralAmount;
                            totalDebt += position.borrowAmount;
                        }
                    } catch {
                        break;
                    }
                }

                monitorData.leverage = {
                    activePositions,
                    totalCollateral: ethers.formatEther(totalCollateral),
                    totalDebt: ethers.formatUnits(totalDebt, 6)
                };

                console.log(`活跃仓位:   ${activePositions}`);
                console.log(`总抵押:     ${monitorData.leverage.totalCollateral} WETH`);
                console.log(`总借款:     ${monitorData.leverage.totalDebt} USDC`);
            } catch (error) {
                console.log("无法获取杠杆数据");
            }

            // 4. 区块链状态
            console.log("\n⛓️  区块链状态:");
            console.log("-".repeat(80));

            const blockNumber = await ethers.provider.getBlockNumber();
            const block = await ethers.provider.getBlock(blockNumber);
            const gasPrice = await ethers.provider.getFeeData();

            console.log(`区块高度:   ${blockNumber}`);
            console.log(`区块时间:   ${new Date((block?.timestamp || 0) * 1000).toLocaleString()}`);
            console.log(`Gas价格:    ${ethers.formatUnits(gasPrice.gasPrice || 0n, "gwei")} gwei`);

            // 5. 事件监听
            console.log("\n📡 近期事件:");
            console.log("-".repeat(80));

            const currentBlock = await ethers.provider.getBlockNumber();
            const fromBlock = currentBlock - 100; // 最近100个区块

            // Vault事件
            const depositFilter = vault.filters.Deposit();
            const withdrawFilter = vault.filters.Withdraw();

            const deposits = await vault.queryFilter(depositFilter, fromBlock, currentBlock);
            const withdraws = await vault.queryFilter(withdrawFilter, fromBlock, currentBlock);

            console.log(`存款事件:   ${deposits.length}`);
            console.log(`提款事件:   ${withdraws.length}`);

            // 保存监控数据
            const monitorFile = join(__dirname, "../logs/monitor.jsonl");
            const fs = require("fs");
            fs.appendFileSync(monitorFile, JSON.stringify(monitorData) + "\n");

            console.log("\n⏰ 下次更新: 60秒后...\n");

            // 等待60秒
            await new Promise(resolve => setTimeout(resolve, 60000));

        } catch (error) {
            console.error("❌ 监控错误:", error);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});