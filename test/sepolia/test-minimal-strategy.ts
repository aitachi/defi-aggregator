import { ethers, upgrades } from "hardhat";

async function main() {
    console.log("🧪 测试最小化 StrategyManager...\n");

    const [deployer] = await ethers.getSigners();
    console.log("📍 部署账户:", deployer.address);

    try {
        const MinimalStrategyManager = await ethers.getContractFactory("MinimalStrategyManager");

        const strategyManager = await upgrades.deployProxy(
            MinimalStrategyManager,
            [deployer.address],
            { initializer: "initialize" }
        );

        await strategyManager.waitForDeployment();
        console.log("✅ 部署成功:", await strategyManager.getAddress());

    } catch (error: any) {
        console.error("❌ 失败:", error.message);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });