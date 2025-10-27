// scripts/interact/deposit.ts
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
    console.log("💰 开始存款操作...\n");

    const [user] = await ethers.getSigners();
    console.log("用户地址:", user.address);

    // 加载部署信息
    const network = (await ethers.provider.getNetwork()).name;
    const deploymentPath = join(__dirname, `../../deployments/core-${network}.json`);
    const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

    const vaultAddress = deployment.contracts.vault;
    const vault = await ethers.getContractAt("Vault", vaultAddress);

    // 获取底层资产
    const assetAddress = await vault.asset();
    const asset = await ethers.getContractAt("IERC20", assetAddress);

    // 存款金额 (1000 USDC)
    const depositAmount = ethers.parseUnits("1000", 6);

    console.log("金库地址:", vaultAddress);
    console.log("资产地址:", assetAddress);
    console.log("存款金额:", ethers.formatUnits(depositAmount, 6), "USDC\n");

    // ==========================================
    // 1. 检查余额
    // ==========================================
    console.log("📌 步骤 1: 检查余额");

    const userBalance = await asset.balanceOf(user.address);
    console.log("  用户余额:", ethers.formatUnits(userBalance, 6), "USDC");

    if (userBalance < depositAmount) {
        console.error("  ❌ 余额不足！");
        return;
    }

    // ==========================================
    // 2. 授权
    // ==========================================
    console.log("\n📌 步骤 2: 授权代币");

    const allowance = await asset.allowance(user.address, vaultAddress);

    if (allowance < depositAmount) {
        console.log("  正在授权...");
        const approveTx = await asset.approve(vaultAddress, depositAmount);
        await approveTx.wait();
        console.log("  ✅ 授权成功");
    } else {
        console.log("  ✅ 已有足够授权");
    }

    // ==========================================
    // 3. 存款
    // ==========================================
    console.log("\n📌 步骤 3: 执行存款");

    const sharesBefore = await vault.balanceOf(user.address);
    console.log("  存款前份额:", ethers.formatEther(sharesBefore));

    const depositTx = await vault.deposit(depositAmount);
    const receipt = await depositTx.wait();

    console.log("  ✅ 存款交易确认");
    console.log("  交易哈希:", receipt?.hash);

    // ==========================================
    // 4. 验证结果
    // ==========================================
    console.log("\n📌 步骤 4: 验证结果");

    const sharesAfter = await vault.balanceOf(user.address);
    const sharesReceived = sharesAfter - sharesBefore;

    console.log("  存款后份额:", ethers.formatEther(sharesAfter));
    console.log("  获得份额:", ethers.formatEther(sharesReceived));

    const totalAssets = await vault.totalAssets();
    console.log("  金库总资产:", ethers.formatUnits(totalAssets, 6), "USDC");

    const sharePrice = await vault.convertToAssets(ethers.parseEther("1"));
    console.log("  每份额价值:", ethers.formatUnits(sharePrice, 6), "USDC");

    console.log("\n✅ 存款完成！");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 存款失败:", error);
        process.exit(1);
    });