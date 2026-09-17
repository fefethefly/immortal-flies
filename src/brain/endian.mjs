/**
 * graph.bin 端序。encodeGraph 用宿主 Uint32Array 写 IFF1 魔数 0x49464631；
 * 小端文件头字节是 31 46 46 49。官方向量与领段只认这份字节序。
 */
import { requireValue } from "./codec.mjs";

export const GRAPH_MAGIC_LE = Object.freeze([0x31, 0x46, 0x46, 0x49]);

export function hostEndian() {
  const bytes = new Uint8Array(new Uint32Array([0x49464631]).buffer);
  if (
    bytes[0] === GRAPH_MAGIC_LE[0] &&
    bytes[1] === GRAPH_MAGIC_LE[1] &&
    bytes[2] === GRAPH_MAGIC_LE[2] &&
    bytes[3] === GRAPH_MAGIC_LE[3]
  ) {
    return "little";
  }
  if (
    bytes[0] === 0x49 &&
    bytes[1] === 0x46 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x31
  ) {
    return "big";
  }
  return "unknown";
}

export function graphFileEndian(buffer) {
  const bytes = new Uint8Array(buffer);
  requireValue(bytes.byteLength >= 4, "GRAPH_SIZE", "graph.bin 太短");
  if (
    bytes[0] === GRAPH_MAGIC_LE[0] &&
    bytes[1] === GRAPH_MAGIC_LE[1] &&
    bytes[2] === GRAPH_MAGIC_LE[2] &&
    bytes[3] === GRAPH_MAGIC_LE[3]
  ) {
    return "little";
  }
  if (
    bytes[0] === 0x49 &&
    bytes[1] === 0x46 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x31
  ) {
    return "big";
  }
  return "unknown";
}

/** 官方连接组文件必须是小端 IFF1。内存里 encodeGraph 的夹具不走这条。 */
export function requireLittleEndianGraph(buffer) {
  requireValue(
    graphFileEndian(buffer) === "little",
    "GRAPH_ENDIAN",
    "graph.bin 必须是 IFF1 小端 Uint32；本机或文件端序不符，拒绝领段",
  );
  requireValue(
    hostEndian() === "little",
    "HOST_ENDIAN",
    "官方向量只在小端主机上跑；大端机器不要领段",
  );
  return "little";
}
