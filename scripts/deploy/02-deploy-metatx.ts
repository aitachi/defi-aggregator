// scripts/deploy/02-deploy-metatx.ts
import { ethers } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

interface MetaTxContracts {
    forwarder: string;
    relayHub: string;
    gaslessVault: string;
}

async function main() {
    console.log("🚀 开始部署元交易系统...\n");

    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);

    const deployedContracts: MetaTxContracts = {} as MetaTxContracts;

    // 读取核心系统部署信息
    const network = (await ethers.provider.getNetwork()).name;
    const coreDeploymentPath = join(__dirname, `../../deployments/core-${network}.json`);

    if (!existsSync(coreDeploymentPath)) {
        throw new Error("❌ 请先部署核心系统 (运行 01-deploy-core.ts)");
    }

    const coreDeployment = JSON.parse(readFileSync(coreDeploymentPath, "utf-8"));
    console.log("✅ 已加载核心系统部署信息\n");

    // ==========================================
    // 1. 部署转发器
    // ==========================================
    console.log("📌 步骤 1: 部署 MetaTxForwarder");

    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const forwarder = await MetaTxForwarder.deploy();
    await forwarder.waitForDeployment();
    deployedContracts.forwarder = await forwarder.getAddress();
    console.log("  ✅ MetaTxForwarder:", deployedContracts.forwarder, "\n");

    // ==========================================
    // 2. 部署中继中心
    // ==========================================
    console.log("📌 步骤 2: 部署 RelayHub");

    const RelayHub = await ethers.getContractFactory("RelayHub");
    const relayHub = await RelayHub.deploy(deployedContracts.forwarder);
    await relayHub.waitForDeployment();
    deployedContracts.relayHub = await relayHub.getAddress();
    console.log("  ✅ RelayHub:", deployedContracts.relayHub, "\n");

    // ==========================================
    // 3. 部署支持元交易的金库
    // ==========================================
    console.log("📌 步骤 3: 部署 GaslessVault");

    const USDC = process.env.USDC_ADDRESS || "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    const GaslessVault = await ethers.getContractFactory("GaslessVault");
    const gaslessVault = await GaslessVault.deploy(
        USDC,
        "Gasless USDC Vault",
        "glUSDC",
        deployedContracts.forwarder
    );
    await gaslessVault.waitForDeployment();
    deployedContracts.gaslessVault = await gaslessVault.getAddress();
    console.log("  ✅ GaslessVault:", deployedContracts.gaslessVault, "\n");

    // ==========================================
    // 4. 配置中继器
    // ==========================================
    console.log("📌 步骤 4: 配置中继器");

    // 注册初始中继器
    await relayHub.registerRelayer(deployer.address, "https://relayer.example.com");
    console.log("  ✅ 已注册初始中继器:", deployer.address);

    // 设置Gas代付策略
    await relayHub.setGasSubsidyRate(80); // 补贴80%的gas费用
    console.log("  ✅ Gas补贴率设置为 80%\n");

    // ==========================================
    // 5. 充值中继中心
    // ==========================================
    console.log("📌 步骤 5: 充值中继中心");

    const fundAmount = ethers.parseEther("0.1"); // 0.1 ETH
    const fundTx = await deployer.sendTransaction({
        to: deployedContracts.relayHub,
        value: fundAmount
    });
    await fundTx.wait();
    console.log("  ✅ 已充值", ethers.formatEther(fundAmount), "ETH\n");

    // ==========================================
    // 6. 保存部署信息
    // ==========================================
    console.log("📌 步骤 6: 保存部署信息");

    const deploymentInfo = {
        network,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: deployedContracts,
        configuration: {
            gasSubsidyRate: 80,
            initialRelayer: deployer.address
        }
    };

    const filename = join(__dirname, `../../deployments/metatx-${network}.json`);
    writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log("  ✅ 部署信息已保存:", filename, "\n");

    // ==========================================
    // 7. 测试元交易
    // ==========================================
    console.log("📌 步骤 7: 测试元交易功能");

    const domain = {
        name: "MetaTxForwarder",
        version: "1",
        chainId: deploymentInfo.chainId,
        verifyingContract: deployedContracts.forwarder
    };

    const types = {
        ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "gas", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "data", type: "bytes" }
        ]
    };

    const nonce = await forwarder.getNonce(deployer.address);
    const request = {
        from: deployer.address,
        to: deployedContracts.gaslessVault,
        value: 0,
        gas: 200000,
        nonce: Number(nonce),
        data: "0x" // 示例数据
    };

    const signature = await deployer.signTypedData(domain, types, request);
    console.log("  ✅ 元交易签名成功");
    console.log("  签名:", signature.slice(0, 20) + "...\n");

    console.log("✅ 元交易系统部署完成！\n");
    console.log("=" .repeat(60));
    console.log("📝 重要地址:");
    console.log("=" .repeat(60));
    Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`${name.padEnd(20)}: ${address}`);
    });
    console.log("=" .repeat(60));
    console.log("\n💡 提示:");
    console.log("  1. 启动 Go 中继服务: cd go-relayer && go run cmd/relayer/main.go");
    console.log("  2. 配置环境变量: FORWARDER_ADDRESS=" + deployedContracts.forwarder);
    console.log("  3. 测试无Gas交易: npm run interact:metatx\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 部署失败:", error);
        process.exit(1);
    });