// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ISoulView} from "./ISoulView.sol";
/// @dev phenotype-loci/3 decoder. Weighted rolls, no rarity grade in metadata.
///      Looks may be replaced on Soul after a 48h challenge window; loci() prefix must match.
contract SoulRenderer {
    using Strings for uint256;
    // Exact RGB values of JS hslToHex at the finite 12 x 3 x 3 palette entries.
    bytes internal constant PALETTE = hex"675332907547b294627156289f7938c299517c591dae7d29d29d41674732906447b282627145289f6138c27e517c431dae5e29d27b415c6732819047a2b2626371288a9f38abc251697c1d93ae29b5d241324d67476b90628ab2284d71386b9f518ac21d4d7c296bae418ad2323b67475390626fb228347138499f5164c21d2d7c293fae4159d267323b904753b2626f7128349f3849c251647c1d2dae293fd24159674032905a47b27762713b289f5338c26f517c361dae4c29d26841675732907a47b29a62715b289f8038c2a0517c5f1dae8629d2a741674b32906947b28762714a289f6838c286517c491dae6729d2854132674b47906962b28728714a389f6851c2861d7c4929ae6741d2853f32675947907662b23a287151389f6e51c2351d7c4a29ae6541d2675532907747b297627159289f7c38c29c517c5c1dae8129d2a241";
    struct Phenotype {
        uint8 hue;
        uint8 saturation;
        uint8 light;
        uint8 eye;
        uint8 size;
        uint8 stripes;
        uint8 mark;
        uint8 wingMark;
        uint8 wingShape;
        uint8 wingVein;
        uint8 sex;
        string body;
    }

    function version() external pure returns (uint16) {
        return 3;
    }

    function decoderId() external pure returns (string memory) {
        return "phenotype-loci/3";
    }

    /// @dev Market locus bytes in birth order. A newer renderer may append, not rewrite this prefix.
    function loci(uint32 seed) public pure returns (bytes memory out) {
        Phenotype memory p = decode(seed);
        out = new bytes(11);
        out[0] = bytes1(p.hue);
        out[1] = bytes1(p.saturation);
        out[2] = bytes1(p.light);
        out[3] = bytes1(p.eye);
        out[4] = bytes1(p.size);
        out[5] = bytes1(p.stripes);
        out[6] = bytes1(p.mark);
        out[7] = bytes1(p.wingMark);
        out[8] = bytes1(p.wingShape);
        out[9] = bytes1(p.wingVein);
        out[10] = bytes1(p.sex);
    }

    function tokenURI(address collection, uint256 id) external view returns (string memory) {
        ISoulView soul = ISoulView(collection);
        ISoulView.Genome memory g = soul.getGenome(id);
        ISoulView.Descent memory d = soul.getDescent(id);
        return render(id, g.seed, soul.lifeId(id), soul.genesisRoot(), soul.genomeHash(id), d.generation, soul.givenName(id));
    }

    function fillChips(uint32 seed) private pure returns (bytes memory chips) {
        chips = new bytes(96);
        uint32 rng = seed == 0 ? 1 : seed;
        unchecked {
            for (uint256 i = 0; i < 96; ++i) {
                rng ^= uint32(i * 0x9e3779b9);
                rng ^= rng << 13;
                rng ^= rng >> 17;
                rng ^= rng << 5;
                if (rng == 0) rng = 1;
                chips[i] = bytes1(uint8(rng >> 24));
            }
        }
    }

    function chipWords(uint32 seed) public pure returns (bytes32 w0, bytes32 w1, bytes32 w2) {
        bytes memory chips = fillChips(seed);
        assembly ("memory-safe") {
            w0 := mload(add(chips, 32))
            w1 := mload(add(chips, 64))
            w2 := mload(add(chips, 96))
        }
    }

    function roll(bytes memory chips, uint256 start, uint256 end) private pure returns (uint16) {
        uint256 x;
        unchecked {
            for (uint256 i = start; i < end; ++i) x = x * 31 + uint8(chips[i]);
        }
        return uint16(x % 10000);
    }

    function pick(uint16 rolled, uint16[12] memory weights, uint256 n) private pure returns (uint8) {
        uint256 acc;
        for (uint256 i = 0; i < n; ++i) {
            acc += weights[i];
            if (rolled < acc) return uint8(i);
        }
        return uint8(n - 1);
    }

    function pick4(uint16 r, uint16 a, uint16 b, uint16 c) private pure returns (uint8) {
        if (r < a) return 0;
        unchecked {
            uint256 ab = uint256(a) + b;
            if (r < ab) return 1;
            if (r < ab + c) return 2;
        }
        return 3;
    }

    function decode(uint32 seed) public pure returns (Phenotype memory p) {
        bytes memory chips = fillChips(seed);
        uint16[12] memory hueW = [uint16(1600), 1500, 1300, 400, 350, 850, 900, 1300, 700, 650, 250, 200];
        uint16[12] memory satW = [uint16(5000), 3500, 1500, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        uint16[12] memory lightW = [uint16(3000), 5200, 1800, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        uint16[12] memory eyeW = [uint16(4200), 1800, 1400, 1600, 700, 300, 0, 0, 0, 0, 0, 0];
        uint16[12] memory sizeW = [uint16(2400), 5600, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        uint16[12] memory stripeW = [uint16(1100), 2200, 3800, 2200, 700, 0, 0, 0, 0, 0, 0, 0];
        uint16[12] memory markW = [uint16(6400), 2600, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        p.hue = pick(roll(chips, 0, 8), hueW, 12);
        p.saturation = pick(roll(chips, 8, 16), satW, 3);
        p.light = p.hue == 11 ? 2 : pick(roll(chips, 16, 24), lightW, 3);
        p.eye = pick(roll(chips, 24, 32), eyeW, 6);
        p.size = pick(roll(chips, 32, 40), sizeW, 3);
        p.stripes = pick(roll(chips, 40, 48), stripeW, 5);
        p.mark = pick(roll(chips, 48, 56), markW, 3);
        p.wingMark = pick4(roll(chips, 64, 72), 7000, 1800, 800);
        p.wingShape = pick4(roll(chips, 72, 80), 7800, 1200, 700);
        uint16 veinR = roll(chips, 80, 88);
        p.wingVein = veinR < 8600 ? 0 : (veinR < 9600 ? 1 : 2);
        p.sex = roll(chips, 88, 96) < 5000 ? 0 : 1;
        uint256 offset = (uint256(p.hue) * 9 + uint256(p.saturation) * 3 + p.light) * 3;
        bytes memory palette = PALETTE;
        uint256 rgb = (uint256(uint8(palette[offset])) << 16) | (uint256(uint8(palette[offset + 1])) << 8) | uint8(palette[offset + 2]);
        bytes memory color = bytes(Strings.toHexString(rgb, 3));
        color[1] = "#";
        bytes memory out = new bytes(7);
        for (uint256 i = 0; i < 7; ++i) out[i] = color[i + 1];
        p.body = string(out);
    }

    function attr(string memory k, string memory v) private pure returns (string memory) {
        return string.concat('{"trait_type":"', k, '","value":"', v, '"}');
    }

    function render(uint256 id, uint32 seed, bytes32 life, bytes32 genesis, bytes32 birth, uint32 generation, string memory given) public pure returns (string memory) {
        Phenotype memory p = decode(seed);
        string[12] memory hues = ["amber", "umber", "olive", "slate", "ink", "wine", "rust", "sand", "copper", "pine", "indigo", "bone"];
        string[3] memory sats = ["muted", "clear", "vivid"];
        string[3] memory lights = ["dark", "mid", "light"];
        string[6] memory eyes = ["wild", "cinnabar", "sepia", "vermilion", "white", "pale"];
        string[6] memory eyeColors = ["#b57660", "#c23b2e", "#6b4a32", "#d46a4a", "#e4d9c4", "#c4b49a"];
        string[3] memory sizes = ["petite", "typical", "large"];
        string[3] memory scales = ["0.88", "1", "1.12"];
        string[3] memory marks = ["none", "bar", "spots"];
        string[4] memory wingMarks = ["clear", "apical", "banded", "pictured"];
        string[4] memory wingShapes = ["typical", "miniature", "curly", "vestigial"];
        string[3] memory veins = ["complete", "incomplete", "extra"];
        string memory stripes = "";
        for (uint256 i = 0; i < p.stripes; ++i) {
            stripes = string.concat(stripes, '<path d="M-30 ', (18 + i * 12).toString(), ' h60" stroke="#30271d" stroke-width="5"/>');
        }
        string memory markSvg = "";
        if (p.mark == 1) markSvg = '<rect x="-11" y="22" width="22" height="7" rx="2" fill="#30271d"/>';
        if (p.mark == 2) markSvg = '<circle cx="-9" cy="30" r="4" fill="#30271d"/><circle cx="9" cy="30" r="4" fill="#30271d"/>';
        string memory wingX = p.wingShape == 1 ? " scale(.72)" : (p.wingShape == 2 ? " rotate(22)" : (p.wingShape == 3 ? " scale(.38)" : ""));
        string memory blot = p.wingMark == 0 ? "" : '<circle cx="-70" cy="-70" r="8" fill="#30271d" opacity=".5"/><circle cx="70" cy="-70" r="8" fill="#30271d" opacity=".5"/>';
        string memory dimorph = p.sex == 0 ? "" : '<path d="M-26 8 h10M16 8 h10" stroke="#30271d" stroke-width="3"/>';
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440"><rect width="400" height="440" fill="#0a0907"/><g transform="translate(200 210) scale(',
            scales[p.size],
            ')"><path d="M-22 0L-95 70M-22 25L-100 115M-22 50L-82 152M22 0L95 70M22 25L100 115M22 50L82 152" stroke="#f0b90b" stroke-width="3"/><g transform="',
            wingX,
            '"><ellipse cx="-58" cy="-24" rx="35" ry="88" transform="rotate(-35 -58 -24)" fill="#e6e0cf" opacity=".28"/><ellipse cx="58" cy="-24" rx="35" ry="88" transform="rotate(35 58 -24)" fill="#e6e0cf" opacity=".28"/>',
            blot,
            '</g><ellipse cy="38" rx="31" ry="',
            p.sex == 1 ? "62" : "76",
            '" fill="',
            p.body,
            '"/>',
            stripes,
            markSvg,
            dimorph,
            '<ellipse cy="-33" rx="33" ry="40" fill="',
            p.body,
            '"/><circle cx="-23" cy="-53" r="15" fill="',
            eyeColors[p.eye],
            '"/><circle cx="23" cy="-53" r="15" fill="',
            eyeColors[p.eye],
            '"/></g><text x="24" y="386" fill="#f0ead9" font-family="monospace" font-size="20">IMMORTAL #',
            id.toString(),
            '</text><text x="24" y="416" fill="#a89e8c" font-family="monospace" font-size="12">GEN',
            uint256(generation).toString(),
            ' / phenotype-loci/3</text></svg>'
        );
        string memory genLabel = string.concat("Gen", uint256(generation).toString());
        string memory title = bytes(given).length == 0
            ? string.concat("Immortal Fly #", id.toString())
            : string.concat(given, " #", id.toString());
        string memory attrs = string.concat(
            attr("Body", hues[p.hue]), ",",
            attr("Saturation", sats[p.saturation]), ",",
            attr("Light", lights[p.light]), ",",
            attr("Eyes", eyes[p.eye]), ",",
            attr("Size", sizes[p.size]), ",",
            '{"trait_type":"Stripes","value":', uint256(p.stripes).toString(), ',"display_type":"number","max_value":4},',
            attr("Mark", marks[p.mark]), ",",
            attr("Wings", wingMarks[p.wingMark]), ",",
            attr("Wing shape", wingShapes[p.wingShape]), ",",
            attr("Veins", veins[p.wingVein]), ",",
            attr("Sex", p.sex == 1 ? "male" : "female"), ",",
            attr("Generation", genLabel)
        );
        string memory json = string.concat(
            '{"name":"', title,
            '","description":"BNB digital life identity. Genome and ownership on chain; connectome computation and archives off chain. Looks are a weighted genome readout. Occurrence is not a price. No protocol mint fee. Not a biological consciousness claim.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","lifeId":"', Strings.toHexString(uint256(life), 32),
            '","genesisRoot":"', Strings.toHexString(uint256(genesis), 32),
            '","genomeHash":"', Strings.toHexString(uint256(birth), 32),
            '","decoder":"phenotype-loci/3","seed":', uint256(seed).toString(),
            ',"generation":', uint256(generation).toString(),
            ',"givenName":"', given,
            '","attributes":[', attrs, ']}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
