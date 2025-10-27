import { ethers } from "hardhat";

async function main() {
    console.log("🔍 检查所有策略合约的构造函数...\n");

    const contracts = [
        "AaveStrategy",
        "CompoundStrategy",
        "CurveStrategy"
    ];

    for (const contractName of contracts) {
        try {
            const Contract = await ethers.getContractFactory(contractName);
            const fragment = Contract.interface.fragments.find(f => f.type === 'constructor');

            console.log(`📋 ${contractName}:`);
            if (fragment && 'inputs' in fragment) {
                console.log(`   参数数量: ${fragment.inputs.length}`);
                fragment.inputs.forEach((input, i) => {
                    console.log(`   参数${i + 1}: ${input.type} ${input.name || ''}`);
                });
            } else {
                console.log(`   没有构造函数或无参数`);
            }
            console.log();
        } catch (error: any) {
            console.log(`❌ ${contractName}: ${error.message}\n`);
        }
    }
}

main().catch(console.error);