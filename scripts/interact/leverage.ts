// scripts/interact/leverage.ts
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
    console.log("📈 开始杠杆操作...\n");

    const [user] = await ethers.getSigners();
    console.log("用户地址:", user.address);

    // 加载部署信息
    const network = (await ethers.provider.getNetwork()).name;
    const leverageDeploymentPath = join(__dirname, `../../deployments/leverage-${network}.json`);
    const leverageDeployment = JSON.parse(readFileSync(leverageDeploymentPath, "utf-8"));

    const helperAddress = leverageDeployment.contracts.leverageHelper;
    const helper = await ethers.getContractAt("LeverageHelper", helperAddress);

    console.log("杠杆助手:", helperAddress, "\n");

    // 参数配置
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    const collateralAmount = ethers.parseEther("1"); // 1 ETH
    const leverageRatio = 200; // 2x杠杆

    console.log("抵押资产: WETH");
    console.log("抵押数量:", ethers.formatEther(collateralAmount), "ETH");
    console.log("借贷资产: USDC");
    console.log("杠杆倍数:", leverageRatio / 100, "x\n");

    // ==========================================
    // 1. 检查余额和授权
    // ==========================================
    console.log("📌 步骤 1: 准备资金");

    const weth = await ethers.getContractAt("IERC20", WETH);
    const wethBalance = await weth.balanceOf(user.address);

    console.log("  WETH余额:", ethers.formatEther(wethBalance));

    if (wethBalance < collateralAmount) {
        console.log("  正在将ETH转换为WETH...");
        const wethContract = await ethers.getContractAt("IWETH", WETH);
        const wrapTx = await wethContract.deposit({ value: collateralAmount });
        await wrapTx.wait();
        console.log("  ✅ WETH转换完成");
    }

    // 授权
    const allowance = await weth.allowance(user.address, helperAddress);
    if (allowance < collateralAmount) {
        console.log("  正在授权WETH...");
        const approveTx = await weth.approve(helperAddress, collateralAmount);
        await approveTx.wait();
        console.log("  ✅ 授权完成");
    }

    // ==========================================
    // 2. 开启杠杆仓位
    // ==========================================
    console.log("\n📌 步骤 2: 开启杠杆仓位");

    const openTx = await helper.openLeveragePosition(
        WETH,                    // 抵押品
        USDC,                    // 借贷资产
        collateralAmount,        // 抵押数量
        leverageRatio,           // 杠杆倍数
        0                        // 最小借贷数量(滑点保护)
    );

    console.log("  交易已提交，等待确认...");
    const receipt = await openTx.wait();
    console.log("  ✅ 仓位已开启");
    console.log("  交易哈希:", receipt?.hash);

    // ==========================================
    // 3. 查询仓位状态
    // ==========================================
    console.log("\n📌 步骤 3: 查询仓位状态");

    const positionId = 0; // 假设这是用户的第一个仓位
    const position = await helper.getPosition(user.address, positionId);

    console.log("  仓位ID:", positionId);
    console.log("  抵押品:", ethers.formatEther(position.collateralAmount), "WETH");
    console.log("  借贷额:", ethers.formatUnits(position.borrowAmount, 6), "USDC");
    console.log("  健康因子:", ethers.formatEther(position.healthFactor));

    const isHealthy = position.healthFactor > ethers.parseEther("1.1");
    console.log("  状态:", isHealthy ? "✅ 健康" : "⚠️  需要关注");

    // ==========================================
    // 4. 模拟再平衡
    // ==========================================
    console.log("\n📌 步骤 4: 检查再平衡需求");

    const needsRebalance = await helper.needsRebalance(user.address, positionId, 200); // 2%偏差

    if (needsRebalance) {
        console.log("  ⚠️  仓位需要再平衡");
        console.log("  执行再平衡...");

        const rebalanceTx = await helper.rebalancePosition(user.address, positionId);
        await rebalanceTx.wait();

        console.log("  ✅ 再平衡完成");
    } else {
        console.log("  ✅ 仓位正常，无需再平衡");
    }

    console.log("\n✅ 杠杆操作完成！");
    console.log("\n💡 提示:");
    console.log("  - 定期监控健康因子，避免清算");
    console.log("  - 可使用 closeLeveragePosition() 平仓");
    console.log("  - 启动再平衡机器人自动维护仓位\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 杠杆操作失败:", error);
        process.exit(1);
    });