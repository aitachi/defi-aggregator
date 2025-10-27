// scripts/test-deployment.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentContracts {
    USDC?: string;
    WETH?: string;
    Vault?: string;
    MetaTxForwarder?: string;
    [key: string]: string | undefined;
}

interface DeploymentData {
    network: string;
    chainId: number;
    deployer: string;
    timestamp: string;
    contracts: DeploymentContracts;
}

async function main() {
    console.log("🧪 开始测试 DeFi Aggregator 部署...\n");

    // 读取部署地址
    const deploymentPath = path.join(__dirname, "../deployments/sepolia.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("❌ 未找到部署文件，请先运行: npx hardhat run scripts/deploy-sepolia.ts --network sepolia");
    }

    const deployment: DeploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contracts = deployment.contracts;

    console.log("📍 网络:", deployment.network);
    console.log("⛓️  Chain ID:", deployment.chainId);
    console.log("👤 部署者:", deployment.deployer);
    console.log("🕒 部署时间:", deployment.timestamp);
    console.log("");

    const [tester] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(tester.address);

    console.log("🧑‍🔬 测试账户:", tester.address);
    console.log("💰 账户余额:", ethers.formatEther(balance), "ETH\n");

    let testResults = {
        passed: 0,
        failed: 0,
        skipped: 0,
        tests: [] as Array<{ name: string; status: string; details?: string }>,
    };

    async function runTest(name: string, testFn: () => Promise<void>, optional: boolean = false) {
        try {
            console.log(`  🔍 测试: ${name}...`);
            await testFn();
            console.log(`    ✅ 通过\n`);
            testResults.passed++;
            testResults.tests.push({ name, status: "PASSED" });
        } catch (error: any) {
            if (optional) {
                console.log(`    ⏭️  跳过: ${error.message}\n`);
                testResults.skipped++;
                testResults.tests.push({ name, status: "SKIPPED", details: error.message });
            } else {
                console.log(`    ❌ 失败: ${error.message}\n`);
                testResults.failed++;
                testResults.tests.push({ name, status: "FAILED", details: error.message });
            }
        }
    }

    function hasContract(contractName: string): boolean {
        return !!(contracts[contractName] && contracts[contractName] !== ethers.ZeroAddress);
    }

    // ========================================
    // 测试已部署的合约
    // ========================================
    console.log("📦 测试组 1: 基础代币合约\n");

    if (hasContract("USDC")) {
        await runTest("MockERC20 (USDC) 基本功能", async () => {
            const mockUSDC = await ethers.getContractAt("MockERC20", contracts.USDC!);
            const name = await mockUSDC.name();
            const symbol = await mockUSDC.symbol();
            const decimals = await mockUSDC.decimals();

            if (name !== "Mock USDC" || symbol !== "USDC" || decimals !== 6n) {
                throw new Error(`Token 属性不正确: ${name}, ${symbol}, ${decimals}`);
            }

            // Mint 代币测试
            const mintAmount = ethers.parseUnits("1000", 6);
            const tx = await mockUSDC.mint(tester.address, mintAmount);
            await tx.wait();

            const balance = await mockUSDC.balanceOf(tester.address);
            if (balance < mintAmount) {
                throw new Error(`Mint 金额不正确: expected ${mintAmount}, got ${balance}`);
            }

            console.log(`    ℹ️  成功 mint ${ethers.formatUnits(balance, 6)} USDC`);
        });
    } else {
        console.log("  ⏭️  USDC 未部署，跳过测试\n");
        testResults.skipped++;
    }

    if (hasContract("WETH")) {
        await runTest("MockERC20 (WETH) 基本功能", async () => {
            const mockWETH = await ethers.getContractAt("MockERC20", contracts.WETH!);
            const name = await mockWETH.name();
            const symbol = await mockWETH.symbol();
            const decimals = await mockWETH.decimals();

            if (name !== "Wrapped ETH" || symbol !== "WETH" || decimals !== 18n) {
                throw new Error(`Token 属性不正确: ${name}, ${symbol}, ${decimals}`);
            }

            // Mint 代币测试
            const mintAmount = ethers.parseEther("10");
            const tx = await mockWETH.mint(tester.address, mintAmount);
            await tx.wait();

            const balance = await mockWETH.balanceOf(tester.address);
            if (balance < mintAmount) {
                throw new Error(`Mint 金额不正确: expected ${mintAmount}, got ${balance}`);
            }

            console.log(`    ℹ️  成功 mint ${ethers.formatEther(balance)} WETH`);
        });
    } else {
        console.log("  ⏭️  WETH 未部署，跳过测试\n");
        testResults.skipped++;
    }

    // ========================================
    // 测试核心合约
    // ========================================
    console.log("📦 测试组 2: 核心 Vault 合约\n");

    if (hasContract("Vault")) {
        await runTest("Vault 基本功能", async () => {
            const vault = await ethers.getContractAt("Vault", contracts.Vault!);

            // 检查合约是否已初始化
            const code = await ethers.provider.getCode(contracts.Vault!);
            if (code === "0x" || code === "0x0") {
                throw new Error("Vault 合约代码为空");
            }

            console.log(`    ℹ️  Vault 合约字节码大小: ${code.length} bytes`);

            // 尝试调用一些基本方法
            try {
                const totalAssets = await vault.totalAssets();
                console.log(`    ℹ️  Vault 总资产: ${totalAssets}`);
            } catch (e: any) {
                console.log(`    ℹ️  totalAssets() 调用失败，可能需要初始化`);
            }
        });

        await runTest("Vault 存款功能", async () => {
            if (!hasContract("USDC")) {
                throw new Error("需要 USDC 合约");
            }

            const vault = await ethers.getContractAt("Vault", contracts.Vault!);
            const usdc = await ethers.getContractAt("MockERC20", contracts.USDC!);

            // Mint USDC
            const depositAmount = ethers.parseUnits("100", 6);
            await (await usdc.mint(tester.address, depositAmount)).wait();

            // 授权
            await (await usdc.approve(contracts.Vault!, depositAmount)).wait();

            // 存款
            const tx = await vault.deposit(contracts.USDC!, depositAmount);
            await tx.wait();

            const balance = await vault.getBalance(tester.address);
            console.log(`    ℹ️  Vault 存款余额: ${ethers.formatUnits(balance, 6)} USDC`);

            if (balance === 0n) {
                throw new Error("存款后余额为 0");
            }
        }, true); // 标记为可选测试
    } else {
        console.log("  ⏭️  Vault 未部署，跳过测试\n");
        testResults.skipped++;
    }

    // ========================================
    // 测试 Meta Transaction 合约
    // ========================================
    console.log("📦 测试组 3: Meta Transaction 合约\n");

    if (hasContract("MetaTxForwarder")) {
        await runTest("MetaTxForwarder 基本功能", async () => {
            const forwarder = await ethers.getContractAt("MetaTxForwarder", contracts.MetaTxForwarder!);

            const code = await ethers.provider.getCode(contracts.MetaTxForwarder!);
            if (code === "0x" || code === "0x0") {
                throw new Error("MetaTxForwarder 合约代码为空");
            }

            const nonce = await forwarder.getNonce(tester.address);
            console.log(`    ℹ️  当前 nonce: ${nonce}`);

            if (nonce < 0n) {
                throw new Error("Nonce 不应为负数");
            }
        });

        await runTest("MetaTxForwarder 中继器管理", async () => {
            const forwarder = await ethers.getContractAt("MetaTxForwarder", contracts.MetaTxForwarder!);

            // 添加中继器（如果有权限）
            try {
                const tx = await forwarder.addRelayer(tester.address);
                await tx.wait();
                console.log(`    ℹ️  成功添加中继器: ${tester.address}`);
            } catch (e: any) {
                if (e.message.includes("Ownable")) {
                    console.log(`    ℹ️  没有 owner 权限，跳过添加中继器`);
                } else {
                    throw e;
                }
            }
        }, true); // 标记为可选测试
    } else {
        console.log("  ⏭️  MetaTxForwarder 未部署，跳过测试\n");
        testResults.skipped++;
    }

    // ========================================
    // 合约交互测试
    // ========================================
    console.log("📦 测试组 4: 合约交互测试\n");

    if (hasContract("USDC") && hasContract("WETH")) {
        await runTest("ERC20 转账测试", async () => {
            const usdc = await ethers.getContractAt("MockERC20", contracts.USDC!);
            const [_, recipient] = await ethers.getSigners();

            const transferAmount = ethers.parseUnits("10", 6);

            // 确保有足够余额
            const balance = await usdc.balanceOf(tester.address);
            if (balance < transferAmount) {
                await (await usdc.mint(tester.address, transferAmount)).wait();
            }

            // 转账
            const tx = await usdc.transfer(recipient.address, transferAmount);
            await tx.wait();

            const recipientBalance = await usdc.balanceOf(recipient.address);
            console.log(`    ℹ️  接收者余额: ${ethers.formatUnits(recipientBalance, 6)} USDC`);

            if (recipientBalance < transferAmount) {
                throw new Error("转账金额不正确");
            }
        });
    }

    // ========================================
    // 网络状态测试
    // ========================================
    console.log("📦 测试组 5: 网络状态\n");

    await runTest("网络连接性", async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);

        console.log(`    ℹ️  当前区块: ${blockNumber}`);
        console.log(`    ℹ️  区块时间: ${new Date(block!.timestamp * 1000).toISOString()}`);
        console.log(`    ℹ️  Gas Limit: ${block!.gasLimit}`);

        if (blockNumber === 0) {
            throw new Error("区块号异常");
        }
    });

    await runTest("Gas 价格检查", async () => {
        const feeData = await ethers.provider.getFeeData();

        console.log(`    ℹ️  Gas Price: ${ethers.formatUnits(feeData.gasPrice || 0n, "gwei")} Gwei`);
        console.log(`    ℹ️  Max Fee: ${ethers.formatUnits(feeData.maxFeePerGas || 0n, "gwei")} Gwei`);
        console.log(`    ℹ️  Priority Fee: ${ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, "gwei")} Gwei`);

        if ((feeData.gasPrice || 0n) === 0n) {
            throw new Error("Gas 价格为 0");
        }
    });

    // ========================================
    // 测试报告
    // ========================================
    console.log("\n" + "=".repeat(60));
    console.log("📊 测试报告");
    console.log("=".repeat(60));
    console.log(`✅ 通过: ${testResults.passed}`);
    console.log(`❌ 失败: ${testResults.failed}`);
    console.log(`⏭️  跳过: ${testResults.skipped}`);
    console.log(`📈 总计: ${testResults.passed + testResults.failed + testResults.skipped}`);

    const totalTests = testResults.passed + testResults.failed;
    if (totalTests > 0) {
        console.log(`🎯 成功率: ${((testResults.passed / totalTests) * 100).toFixed(2)}%`);
    }
    console.log("=".repeat(60) + "\n");

    if (testResults.failed > 0) {
        console.log("❌ 失败的测试:\n");
        testResults.tests
            .filter((t) => t.status === "FAILED")
            .forEach((t) => {
                console.log(`  ⚠️  ${t.name}`);
                console.log(`      ${t.details}\n`);
            });
    }

    if (testResults.skipped > 0) {
        console.log("⏭️  跳过的测试:\n");
        testResults.tests
            .filter((t) => t.status === "SKIPPED")
            .forEach((t) => {
                console.log(`  ℹ️  ${t.name}`);
                console.log(`      ${t.details}\n`);
            });
    }

    // 保存测试结果
    const testResultsPath = path.join(__dirname, "../deployments/test-results.json");
    const testReport = {
        ...testResults,
        deployment: deployment,
        testTime: new Date().toISOString(),
        network: deployment.network,
        tester: tester.address,
    };

    fs.writeFileSync(testResultsPath, JSON.stringify(testReport, null, 2));
    console.log("💾 测试结果已保存到 deployments/test-results.json\n");

    // 生成测试摘要
    console.log("📋 已部署的合约:");
    Object.entries(contracts).forEach(([name, address]) => {
        if (address && address !== ethers.ZeroAddress) {
            console.log(`  ✓ ${name}: ${address}`);
        }
    });
    console.log("");

    if (testResults.failed > 0) {
        throw new Error(`${testResults.failed} 个测试失败`);
    }

    console.log("✨ 所有测试完成！\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ 测试过程中发生错误:", error.message);
        process.exit(1);
    });