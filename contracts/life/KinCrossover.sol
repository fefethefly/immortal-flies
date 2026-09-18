// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Crossover descent rules shared by SoulKinCross and SoulKinCrossFee.
 *
 * 竞品式交叉遗传，链下研磨、链上验证：
 *   - 每个位点（hue/sat/light/eye/size/stripes/mark/wingMark/wingShape/wingVein）由完成区块哈希决定取自亲本 A、
 *     亲本 B，或发生突变（源字节 < 5，约 1.95% ≈ 2%，按公布率表重掷）。
 *   - 子代 seed 是「血裔候选流」中的一位全中候选：cand(n) = uint32(keccak(GRIND, stream, n))。
 *     完成者在链下研磨（免费、确定性流），把 n 提交给 breed()；合约用一次解码
 *     验证全中后铸出。未来区块哈希在请求时不可知，因此无法提前狙击外形。
 *   - 表型仍然是 phenotype-loci/3 对 seed 的纯读出。性别每代从 chips 88–95 重掷，不进交叉。
 *     已出生的 /2 个体不受影响；本库只服务于新解码器集合。
 */
library KinCrossover {
    /// @dev 约 2% 突变：源字节 < 5（5/256 ≈ 1.95%）。其余各半：字节最高位选亲本。
    uint8 public constant MUTATION_BYTE_MAX = 5;
    uint8 public constant LOCUS_COUNT = 10;

    bytes32 internal constant CROSS_DOMAIN = keccak256("ifs.descent-cross/1");
    bytes32 internal constant GRIND_DOMAIN = keccak256("ifs.descent-grind/1");

    /// @dev 与 SoulRenderer 相同的累积 bps，纯比较实现 —— 验证热路径不分配内存。
    function pickAt(uint16 r, uint256 locus) private pure returns (uint8) {
        if (locus == 0) {
            // hue 1600 1500 1300 400 350 850 900 1300 700 650 250 200
            if (r < 1600) return 0;
            if (r < 3100) return 1;
            if (r < 4400) return 2;
            if (r < 4800) return 3;
            if (r < 5150) return 4;
            if (r < 6000) return 5;
            if (r < 6900) return 6;
            if (r < 8200) return 7;
            if (r < 8900) return 8;
            if (r < 9550) return 9;
            if (r < 9800) return 10;
            return 11;
        } else if (locus == 1) {
            if (r < 5000) return 0;
            if (r < 8500) return 1;
            return 2;
        } else if (locus == 2) {
            if (r < 3000) return 0;
            if (r < 8200) return 1;
            return 2;
        } else if (locus == 3) {
            if (r < 4200) return 0;
            if (r < 6000) return 1;
            if (r < 7400) return 2;
            if (r < 9000) return 3;
            if (r < 9700) return 4;
            return 5;
        } else if (locus == 4) {
            if (r < 2400) return 0;
            if (r < 8000) return 1;
            return 2;
        } else if (locus == 5) {
            if (r < 1100) return 0;
            if (r < 3300) return 1;
            if (r < 7100) return 2;
            if (r < 9300) return 3;
            return 4;
        } else if (locus == 6) {
            if (r < 6400) return 0;
            if (r < 9000) return 1;
            return 2;
        } else if (locus == 7) {
            // wingMark 7000 1800 800 400
            if (r < 7000) return 0;
            if (r < 8800) return 1;
            if (r < 9600) return 2;
            return 3;
        } else if (locus == 8) {
            // wingShape 7800 1200 700 300
            if (r < 7800) return 0;
            if (r < 9000) return 1;
            if (r < 9700) return 2;
            return 3;
        } else {
            // wingVein 8600 1000 400
            if (r < 8600) return 0;
            if (r < 9600) return 1;
            return 2;
        }
    }

    /// @dev 10 个交叉位点序号（含骨白锁 light）。性别不在此列。
    function traitsOf(uint32 seed) internal pure returns (uint8[10] memory t) {
        uint256[12] memory acc;
        uint32 rng = seed == 0 ? 1 : seed;
        unchecked {
            for (uint256 i = 0; i < 88; ++i) {
                rng ^= uint32(i * 0x9e3779b9);
                rng ^= rng << 13;
                rng ^= rng >> 17;
                rng ^= rng << 5;
                if (rng == 0) rng = 1;
                acc[i >> 3] = acc[i >> 3] * 31 + uint256(rng >> 24);
            }
        }
        t[0] = pickAt(uint16(acc[0] % 10000), 0);
        t[1] = pickAt(uint16(acc[1] % 10000), 1);
        t[2] = t[0] == 11 ? uint8(2) : pickAt(uint16(acc[2] % 10000), 2);
        t[3] = pickAt(uint16(acc[3] % 10000), 3);
        t[4] = pickAt(uint16(acc[4] % 10000), 4);
        t[5] = pickAt(uint16(acc[5] % 10000), 5);
        t[6] = pickAt(uint16(acc[6] % 10000), 6);
        t[7] = pickAt(uint16(acc[8] % 10000), 7); // skip acc[7] = leftover eyePair chips
        t[8] = pickAt(uint16(acc[9] % 10000), 8);
        t[9] = pickAt(uint16(acc[10] % 10000), 9);
    }

    /// @dev 每个位点的来源。返回值：0 = 亲本 B，1 = 亲本 A，2 = 突变。
    function sourcesOf(bytes32 entropy, address collection, uint256 requestId)
        internal
        pure
        returns (uint8[10] memory src, bytes32 stream)
    {
        stream = keccak256(abi.encode(CROSS_DOMAIN, collection, requestId, entropy));
        for (uint256 i = 0; i < 10; ++i) {
            uint8 b = uint8(stream[i]);
            src[i] = b < MUTATION_BYTE_MAX ? uint8(2) : uint8(b >> 7);
        }
    }

    /// @dev 血裔候选流的第 n 位：uint32(keccak(GRIND, stream, n))。
    function candidateOf(bytes32 stream, uint256 n) internal pure returns (uint32) {
        uint32 cand = uint32(uint256(keccak256(abi.encode(GRIND_DOMAIN, stream, n))));
        return cand == 0 ? 1 : cand;
    }

    /// @dev 全中校验：逐位点流式解码并比对，遇到第一个未中（且非突变）即否。
    ///      解码结果与 traitsOf 完全一致；xorshift 按 chip 下标连续推进，跳过 56–63。
    function matchesAll(uint32 seed, uint8[10] memory ta, uint8[10] memory tb, uint8[10] memory src)
        internal
        pure
        returns (bool)
    {
        uint32 rng = seed == 0 ? 1 : seed;
        uint8 hue;
        uint256 nextI;
        unchecked {
            for (uint256 locus = 0; locus < 10; ++locus) {
                uint256 start = locus < 7 ? locus * 8 : 64 + (locus - 7) * 8;
                while (nextI < start) {
                    rng ^= uint32(nextI * 0x9e3779b9);
                    rng ^= rng << 13;
                    rng ^= rng >> 17;
                    rng ^= rng << 5;
                    if (rng == 0) rng = 1;
                    nextI += 1;
                }
                uint256 x;
                for (uint256 j = 0; j < 8; ++j) {
                    rng ^= uint32(nextI * 0x9e3779b9);
                    rng ^= rng << 13;
                    rng ^= rng >> 17;
                    rng ^= rng << 5;
                    if (rng == 0) rng = 1;
                    x = x * 31 + uint256(rng >> 24);
                    nextI += 1;
                }
                uint8 trait = pickAt(uint16(x % 10000), locus);
                if (locus == 0) {
                    hue = trait;
                } else if (locus == 2 && hue == 11) {
                    trait = 2;
                }
                if (src[locus] != 2 && trait != (src[locus] == 1 ? ta[locus] : tb[locus])) {
                    return false;
                }
            }
        }
        return true;
    }

    struct Descent {
        uint32 seed;
        uint8[10] sources;
    }

    /// @notice 验证提交的候选 n 是否全中；全中则返回子代 seed。
    function verifyChild(uint32 seedA, uint32 seedB, bytes32 entropy, address collection, uint256 requestId, uint256 n)
        internal
        pure
        returns (Descent memory out)
    {
        (uint8[10] memory src, bytes32 stream) = sourcesOf(entropy, collection, requestId);
        out.sources = src;
        out.seed = candidateOf(stream, n);
        require(matchesAll(out.seed, traitsOf(seedA), traitsOf(seedB), src), "CrossMisfit");
    }
}
