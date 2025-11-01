// scripts/run-bots-sepolia.ts
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
    console.log("🤖 启动Sepolia自动化机器人...\n");

    const deploymentPath = join(__dirname, "../deployments/sepolia-latest.json");
    const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

    const _vault = await ethers.getContractAt("Vault", deployment.contracts.Vault);
    const leverageHelper = await ethers.getContractAt(
        "LeverageHelper",
        deployment.contracts.LeverageHelper
    );
    const liquidationBot = await ethers.getContractAt(
        "LiquidationBot",
        deployment.contracts.LiquidationBot
    );
    const rebalanceBot = await ethers.getContractAt(
        "RebalanceBot",
        deployment.contracts.RebalanceBot
    );
    const harvestBot = await ethers.getContractAt(
        "HarvestBot",
        deployment.contracts.HarvestBot
    );

    const [keeper] = await ethers.getSigners();
    console.log("🔑 Keeper地址:", await keeper.getAddress());

    let iteration = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            iteration++;
            console.log(`\n${"=".repeat(80)}`);
            console.log(`🔄 循环 #${iteration} - ${new Date().toLocaleString()}`);
            console.log("=".repeat(80));

            // 1. 检查并执行收获
            console.log("\n1️⃣ 检查收获机会...");
            const needsHarvest = await harvestBot.checkUpkeep("0x");

            if (needsHarvest[0]) {
                console.log("   ✅ 需要收获，执行中...");
                const tx = await harvestBot.performUpkeep("0x");
                const receipt = await tx.wait();
                console.log(`   ✅ 收获完成, Gas: ${receipt?.gasUsed.toString()}`);
            } else {
                console.log("   ⏭️  无需收获");
            }

            // 2. 检查清算机会
            console.log("\n2️⃣ 检查清算机会...");
            const liquidatablePositions = await liquidationBot.findLiquidatablePositions();

            if (liquidatablePositions.length > 0) {
                console.log(`   ⚠️  发现 ${liquidatablePositions.length} 个可清算仓位`);

                for (const pos of liquidatablePositions) {
                    try {
                        console.log(`   清算仓位: ${pos.user} #${pos.positionId}`);
                        const tx = await liquidationBot.liquidatePosition(
                            pos.user,
                            pos.positionId
                        );
                        const receipt = await tx.wait();
                        console.log(`   ✅ 清算完成, Gas: ${receipt?.gasUsed.toString()}`);
                    } catch (error) {
                        console.log(`   ❌ 清算失败:`, error.message);
                    }
                }
            } else {
                console.log("   ✅ 无需清算");
            }

            // 3. 检查再平衡需求
            console.log("\n3️⃣ 检查再平衡需求...");

            // 简化版：只检查部署者的仓位
            const [deployer] = await ethers.getSigners();
            for (let i = 0; i < 5; i++) {
                try {
                    const position = await leverageHelper.getPosition(deployer.address, i);
                    if (!position.isActive) continue;

                    const needsRebalance = await rebalanceBot.needsRebalance(
                        deployer.address,
                        i
                    );

                    if (needsRebalance) {
                        console.log(`   ⚖️  仓位 #${i} 需要再平衡`);
                        const tx = await rebalanceBot.rebalance(deployer.address, i);
                        const receipt = await tx.wait();
                        console.log(`   ✅ 再平衡完成, Gas: ${receipt?.gasUsed.toString()}`);
                    }
                } catch {
                    break;
                }
            }

            console.log("   ✅ 再平衡检查完成");

            // 4. Gas价格监控
            const feeData = await ethers.provider.getFeeData();
            const gasPrice = ethers.formatUnits(feeData.gasPrice || 0n, "gwei");
            console.log(`\n💰 当前Gas价格: ${gasPrice} gwei`);

            // 如果gas太贵，延长等待时间
            const waitTime = parseFloat(gasPrice) > 50 ? 300000 : 120000; // 5分钟或2分钟
            console.log(`⏰ 等待 ${waitTime / 1000} 秒...\n`);

            await new Promise(resolve => setTimeout(resolve, waitTime));

        } catch (error) {
            console.error("\n❌ 机器人错误:", error);
            console.log("⏰ 10秒后重试...\n");
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});