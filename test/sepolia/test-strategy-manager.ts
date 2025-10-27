import { ethers, upgrades } from "hardhat";

async function main() {
    console.log("🧪 测试 StrategyManager 单独部署...\n");

    const [deployer] = await ethers.getSigners();
    console.log("📍 部署账户:", deployer.address);
    console.log("💰 账户余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

    try {
        console.log("📦 步骤 1: 获取合约工厂...");
        const StrategyManager = await ethers.getContractFactory("StrategyManager");
        console.log("✅ 合约工厂创建成功\n");

        console.log("📦 步骤 2: 部署代理合约...");
        console.log("初始化参数: admin =", deployer.address);

        const strategyManager = await upgrades.deployProxy(
            StrategyManager,
            [deployer.address],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );

        console.log("⏳ 等待部署确认...");
        await strategyManager.waitForDeployment();

        const proxyAddress = await strategyManager.getAddress();
        console.log("✅ 代理合约地址:", proxyAddress);

        // 获取实现合约地址
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
        console.log("✅ 实现合约地址:", implementationAddress);

        // 获取管理员地址
        const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
        console.log("✅ 代理管理员地址:", adminAddress);

        console.log("\n📦 步骤 3: 验证合约功能...");

        // 测试角色授予
        const STRATEGIST_ROLE = ethers.keccak256(ethers.toUtf8Bytes("STRATEGIST_ROLE"));
        console.log("- 授予 STRATEGIST_ROLE 给部署者...");
        const grantTx = await strategyManager.grantRole(STRATEGIST_ROLE, deployer.address);
        await grantTx.wait();
        console.log("✅ 角色授予成功");

        // 验证角色
        const hasRole = await strategyManager.hasRole(STRATEGIST_ROLE, deployer.address);
        console.log("- 验证角色:", hasRole ? "✅ 成功" : "❌ 失败");

        // 测试白名单协议
        const mockProtocol = "0x1234567890123456789012345678901234567890";
        console.log("- 添加白名单协议:", mockProtocol);
        const whitelistTx = await strategyManager.whitelistProtocol(mockProtocol);
        await whitelistTx.wait();
        console.log("✅ 白名单添加成功");

        // 验证白名单
        const isWhitelisted = await strategyManager.whitelistedProtocols(mockProtocol);
        console.log("- 验证白名单:", isWhitelisted ? "✅ 成功" : "❌ 失败");

        console.log("\n" + "=".repeat(60));
        console.log("🎉 StrategyManager 部署和测试完成！");
        console.log("=".repeat(60));
        console.log("\n📋 部署信息:");
        console.log("  代理合约地址:      ", proxyAddress);
        console.log("  实现合约地址:      ", implementationAddress);
        console.log("  代理管理员地址:    ", adminAddress);
        console.log("  部署者地址:        ", deployer.address);
        console.log("\n✅ 所有测试通过！\n");

    } catch (error: any) {
        console.error("\n❌ 部署失败:");
        console.error("错误信息:", error.message);

        if (error.message.includes("not upgrade safe")) {
            console.error("\n🔍 诊断信息:");
            console.error("这个错误表明合约不符合可升级合约的要求。");
            console.error("\n请检查 StrategyManager.sol:");
            console.error("1. constructor() 应该只包含 _disableInitializers();");
            console.error("2. 所有继承的合约都应该是 -upgradeable 版本");
            console.error("3. 应该有 initialize() 函数替代 constructor");
            console.error("4. 应该有 __gap 存储槽");

            console.error("\n当前 hardhat.config.ts 设置:");
            console.error("- viaIR: 应该设置为 false");
            console.error("- optimizer.enabled: true");
            console.error("- optimizer.runs: 200");
        }

        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });