// scripts/tools/fund-accounts.ts
import { ethers } from "hardhat";

async function main() {
    console.log("💸 为测试账户充值...\n");

    const [funder] = await ethers.getSigners();
    console.log("充值账户:", funder.address);

    const recipients = process.env.TEST_ACCOUNTS?.split(",") || [];

    if (recipients.length === 0) {
        console.error("❌ 未配置测试账户地址");
        return;
    }

    const ethAmount = ethers.parseEther("0.1"); // 0.1 ETH per account

    console.log(`将为 ${recipients.length} 个账户充值 ${ethers.formatEther(ethAmount)} ETH\n`);

    for (const recipient of recipients) {
        try {
            const tx = await funder.sendTransaction({
                to: recipient.trim(),
                value: ethAmount
            });
            await tx.wait();
            console.log(`✅ 已充值 ${recipient.trim()}`);
        } catch (error) {
            console.error(`❌ 充值失败 ${recipient.trim()}:`, error);
        }
    }

    console.log("\n✅ 充值完成");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });