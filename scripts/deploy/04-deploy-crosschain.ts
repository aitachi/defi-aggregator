// scripts/deploy/04-deploy-crosschain.ts
import { ethers } from "hardhat";
import { writeFileSync } from "fs";
import { join } from "path";

interface CrossChainContracts {
    bridge: string;
    tokenMappings: Record<string, string>;
}

async function main() {
    console.log("🚀 开始部署跨链桥接系统...\n");

    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);

    const deployedContracts: CrossChainContracts = {
        bridge: "",
        tokenMappings: {}
    };

    // ==========================================
    // 1. 部署跨链桥
    // ==========================================
    console.log("📌 步骤 1: 部署 CrossChainBridge");

    const CrossChainBridge = await ethers.getContractFactory("CrossChainBridge");
    const bridge = await CrossChainBridge.deploy();
    await bridge.waitForDeployment();
    deployedContracts.bridge = await bridge.getAddress();
    console.log("  ✅ CrossChainBridge:", deployedContracts.bridge, "\n");

    // ==========================================
    // 2. 配置支持的链
    // ==========================================
    console.log("📌 步骤 2: 配置支持的链");

    const supportedChains = [
        { id: 1, name: "Ethereum" },
        { id: 137, name: "Polygon" },
        { id: 42161, name: "Arbitrum" },
        { id: 10, name: "Optimism" }
    ];

    for (const chain of supportedChains) {
        await bridge.addSupportedChain(chain.id);
        console.log(`  ✅ 已添加支持链: ${chain.name} (${chain.id})`);
    }
    console.log();

    // ==========================================
    // 3. 配置代币映射
    // ==========================================
    console.log("📌 步骤 3: 配置代币映射");

    const tokenMappings = [
        {
            symbol: "USDC",
            ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
            arbitrum: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8"
        },
        {
            symbol: "USDT",
            ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            polygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
            arbitrum: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
        }
    ];

    for (const token of tokenMappings) {
        // Ethereum <-> Polygon
        await bridge.mapToken(token.ethereum, 137, token.polygon);
        await bridge.mapToken(token.polygon, 1, token.ethereum);

        // Ethereum <-> Arbitrum
        await bridge.mapToken(token.ethereum, 42161, token.arbitrum);
        await bridge.mapToken(token.arbitrum, 1, token.ethereum);

        deployedContracts.tokenMappings[token.symbol] = JSON.stringify({
            ethereum: token.ethereum,
            polygon: token.polygon,
            arbitrum: token.arbitrum
        });

        console.log(`  ✅ 已配置 ${token.symbol} 跨链映射`);
    }
    console.log();

    // ==========================================
    // 4. 设置验证器
    // ==========================================
    console.log("📌 步骤 4: 设置验证器");

    const VALIDATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VALIDATOR_ROLE"));
    const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

    // 添加验证器 (多签安全)
    const validators = [
        deployer.address,
        // 添加更多验证器地址
    ];

    for (const validator of validators) {
        await bridge.grantRole(VALIDATOR_ROLE, validator);
        console.log(`  ✅ 已添加验证器: ${validator}`);
    }

    // 设置最小验证器数量
    await bridge.setMinValidators(Math.ceil(validators.length / 2));
    console.log(`  ✅ 最小验证器数量设置为: ${Math.ceil(validators.length / 2)}\n`);

    // ==========================================
    // 5. 添加中继器
    // ==========================================
    console.log("📌 步骤 5: 添加中继器");

    await bridge.grantRole(RELAYER_ROLE, deployer.address);
    console.log("  ✅ 已添加中继器:", deployer.address, "\n");

    // ==========================================
    // 6. 保存部署信息
    // ==========================================
    console.log("📌 步骤 6: 保存部署信息");

    const network = (await ethers.provider.getNetwork()).name;
    const deploymentInfo = {
        network,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: deployedContracts,
        configuration: {
            supportedChains,
            minValidators: Math.ceil(validators.length / 2),
            validators,
            relayers: [deployer.address]
        }
    };

    const filename = join(__dirname, `../../deployments/crosschain-${network}.json`);
    writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log("  ✅ 部署信息已保存:", filename, "\n");

    console.log("✅ 跨链桥接系统部署完成！\n");
    console.log("=" .repeat(60));
    console.log("📝 部署摘要:");
    console.log("=" .repeat(60));
    console.log("桥接合约:", deployedContracts.bridge);
    console.log("支持链数量:", supportedChains.length);
    console.log("代币映射:", Object.keys(deployedContracts.tokenMappings).join(", "));
    console.log("验证器数量:", validators.length);
    console.log("=" .repeat(60));
    console.log("\n💡 下一步:");
    console.log("  1. 在其他链上部署相同的桥接合约");
    console.log("  2. 配置LayerZero端点地址");
    console.log("  3. 启动跨链中继服务\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 部署失败:", error);
        process.exit(1);
    });