// scripts/tools/check-balances.ts
import { ethers } from "hardhat";

async function main() {
    console.log("💰 检查账户余额...\n");

    const [deployer, user1, user2] = await ethers.getSigners();
    const accounts = [
        { name: "Deployer", address: deployer.address },
        { name: "User 1", address: user1.address },
        { name: "User 2", address: user2.address }
    ];

    const tokens = [
        { symbol: "ETH", address: "native", decimals: 18 },
        { symbol: "USDC", address: process.env.USDC_ADDRESS!, decimals: 6 },
        { symbol: "USDT", address: process.env.USDT_ADDRESS!, decimals: 6 },
        { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 }
    ];

    for (const account of accounts) {
        console.log(`\n${account.name} (${account.address})`);
        console.log("-".repeat(60));

        for (const token of tokens) {
            let balance;

            if (token.address === "native") {
                balance = await ethers.provider.getBalance(account.address);
            } else {
                const tokenContract = await ethers.getContractAt("IERC20", token.address);
                balance = await tokenContract.balanceOf(account.address);
            }

            const formatted = ethers.formatUnits(balance, token.decimals);
            console.log(`  ${token.symbol.padEnd(10)}: ${formatted}`);
        }
    }

    console.log("\n✅ 余额检查完成");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });