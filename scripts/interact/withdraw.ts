// scripts/interact/withdraw.ts
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
    console.log("💸 开始提款操作...\n");

    const [user] = await ethers.getSigners();
    console.log("用户地址:", user.address);

    // 加载部署信息
    const network = (await ethers.provider.getNetwork()).name;
    const deploymentPath = join(__dirname, `../../deployments/core-${network}.json`);
    const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

    const vaultAddress = deployment.contracts.vault;
    const vault = await ethers.getContractAt("Vault", vaultAddress);

    const assetAddress = await vault.asset();
    const asset = await ethers.getContractAt("IERC20", assetAddress);

    console.log("金库地址:", vaultAddress);
    console.log("资产地址:", assetAddress, "\n");

    // ==========================================
    // 1. 检查份额
    // ==========================================
    console.log("📌 步骤 1: 检查份额");

    const userShares = await vault.balanceOf(user.address);
    console.log("  用户份额:", ethers.formatEther(userShares));

    if (userShares === 0n) {
        console.error("  ❌ 没有份额可提款！");
        return;
    }

    // 提取50%的份额
    const withdrawShares = userShares / 2n;
    console.log("  提款份额:", ethers.formatEther(withdrawShares));

    // 预览能获得多少资产
    const expectedAssets = await vault.convertToAssets(withdrawShares);
    console.log("  预期资产:", ethers.formatUnits(expectedAssets, 6), "USDC");

    // ==========================================
    // 2. 执行提款
    // ==========================================
    console.log("\n📌 步骤 2: 执行提款");

    const assetsBefore = await asset.balanceOf(user.address);
    console.log("  提款前余额:", ethers.formatUnits(assetsBefore, 6), "USDC");

    const withdrawTx = await vault.withdraw(withdrawShares);
    const receipt = await withdrawTx.wait();

    console.log("  ✅ 提款交易确认");
    console.log("  交易哈希:", receipt?.hash);

    // ==========================================
    // 3. 验证结果
    // ==========================================
    console.log("\n📌 步骤 3: 验证结果");

    const assetsAfter = await asset.balanceOf(user.address);
    const assetsReceived = assetsAfter - assetsBefore;

    console.log("  提款后余额:", ethers.formatUnits(assetsAfter, 6), "USDC");
    console.log("  获得资产:", ethers.formatUnits(assetsReceived, 6), "USDC");

    const sharesRemaining = await vault.balanceOf(user.address);
    console.log("  剩余份额:", ethers.formatEther(sharesRemaining));

    console.log("\n✅ 提款完成！");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 提款失败:", error);
        process.exit(1);
    });