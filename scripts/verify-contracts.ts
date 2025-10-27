import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentData {
    addresses: { [key: string]: string };
}

async function main() {
    console.log("🔍 开始验证合约...\n");

    const deploymentPath = path.join(__dirname, "../deployments/sepolia.json");
    const deployment: DeploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const addresses = deployment.addresses;

    const contractsToVerify = [
        {
            name: "MockERC20 (USDC)",
            address: addresses.mockUSDC,
            constructorArguments: ["Mock USDC", "USDC", 6],
        },
        {
            name: "MockERC20 (DAI)",
            address: addresses.mockDAI,
            constructorArguments: ["Mock DAI", "DAI", 18],
        },
        {
            name: "VaultFactory",
            address: addresses.vaultFactory,
            constructorArguments: [],
        },
        {
            name: "MetaTxForwarder",
            address: addresses.metaTxForwarder,
            constructorArguments: [],
        },
        {
            name: "GasStation",
            address: addresses.gasStation,
            constructorArguments: [addresses.metaTxForwarder],
        },
        // 添加更多合约...
    ];

    for (const contract of contractsToVerify) {
        try {
            console.log(`验证 ${contract.name}...`);
            await run("verify:verify", {
                address: contract.address,
                constructorArguments: contract.constructorArguments,
            });
            console.log(`✅ ${contract.name} 验证成功\n`);
        } catch (error: any) {
            if (error.message.includes("Already Verified")) {
                console.log(`ℹ️  ${contract.name} 已经验证过了\n`);
            } else {
                console.log(`❌ ${contract.name} 验证失败: ${error.message}\n`);
            }
        }
    }

    console.log("✅ 验证完成！");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });