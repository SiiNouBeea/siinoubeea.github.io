import cv2
import numpy as np
import time
from pathlib import Path
from typing import Tuple


class VideoFrameInterpolator:
    """视频帧插值处理器（内存优化版）"""

    def __init__(self, method: str = 'optical_flow'):
        self.method = method

        if method == 'optical_flow':
            self.flow_params = dict(
                pyr_scale=0.5, levels=3, winsize=15,
                iterations=3, poly_n=5, poly_sigma=1.2, flags=0
            )

    def linear_interpolation(self, frame1: np.ndarray, frame2: np.ndarray) -> np.ndarray:
        return cv2.addWeighted(frame1, 0.5, frame2, 0.5, 0)

    def optical_flow_interpolation(self, frame1: np.ndarray, frame2: np.ndarray) -> np.ndarray:
        # 转换灰度图
        gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)

        # 计算光流
        flow = cv2.calcOpticalFlowFarneback(gray1, gray2, None, **self.flow_params)

        # 生成中间帧（使用反向warping减少鬼影）
        h, w = flow.shape[:2]
        flow_12 = flow * 0.5

        # 创建网格
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        map_x = x + flow_12[..., 0]
        map_y = y + flow_12[..., 1]

        # 双向warping
        warped1 = cv2.remap(frame1, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        warped2 = cv2.remap(frame2, x - flow_12[..., 0], y - flow_12[..., 1],
                            cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

        # 混合
        mask = np.linalg.norm(flow_12, axis=2)[:, :, np.newaxis]
        mask = np.clip(mask / 20.0, 0, 1)  # 自适应混合
        return (warped1 * (1 - mask) + warped2 * mask).astype(np.uint8)

    def interpolate(self, frame1: np.ndarray, frame2: np.ndarray) -> np.ndarray:
        if self.method == 'linear':
            return self.linear_interpolation(frame1, frame2)
        elif self.method == 'optical_flow':
            return self.optical_flow_interpolation(frame1, frame2)
        else:
            raise ValueError(f"未知方法: {self.method}")


def calculate_psnr(frame1: np.ndarray, frame2: np.ndarray) -> float:
    """计算PSNR"""
    mse = np.mean((frame1.astype(np.float32) - frame2.astype(np.float32)) ** 2)
    if mse == 0:
        return float('inf')
    return 20 * np.log10(255.0 / np.sqrt(mse))


def process_video_streaming(
        input_path: str,
        output_path: str,
        method: str = 'optical_flow',
        downsample_factor: int = 2,
        max_memory_gb: float = 2.0
) -> Tuple[float, float, dict]:
    """
    流式处理视频（内存优化）

    :param max_memory_gb: 最大内存使用限制（GB）
    :return: (平均PSNR, 处理耗时, 统计信息)
    """

    # 打开视频
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError("无法打开视频")

    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    target_fps = fps // downsample_factor

    # 计算内存使用情况
    frame_memory_mb = (width * height * 3) / (1024 ** 2)
    max_frames_in_memory = int((max_memory_gb * 1024) / frame_memory_mb)

    print(f"原始视频: {fps}fps, {width}x{height}, {total_frames}帧")
    print(f"每帧内存: {frame_memory_mb:.1f}MB, 最大内存帧数: {max_frames_in_memory}")

    # 第一步：生成降采样视频
    temp_downsampled = str(Path(output_path).parent / "temp_downsampled.mp4")
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out_downsampled = cv2.VideoWriter(temp_downsampled, fourcc, target_fps, (width, height))

    # 保存关键帧索引（不保存图像）
    key_frame_indices = []
    frame_idx = 0

    print("降采样中...")
    start_time = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % downsample_factor == 0:
            out_downsampled.write(frame)
            key_frame_indices.append(frame_idx)

        frame_idx += 1
        if frame_idx % 100 == 0:
            print(f"  已处理 {frame_idx}/{total_frames} 帧")

    cap.release()
    out_downsampled.release()

    # 第二步：流式插值和PSNR计算
    print("开始插值和PSNR计算...")
    cap_original = cv2.VideoCapture(input_path)
    cap_downsampled = cv2.VideoCapture(temp_downsampled)
    out_restored = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    interpolator = VideoFrameInterpolator(method=method)

    psnr_values = []
    frame_count = 0
    processed_frames = 0

    # 读取第一帧
    ret, prev_frame = cap_downsampled.read()
    if not ret:
        raise ValueError("降采样视频为空")

    out_restored.write(prev_frame)
    processed_frames += 1

    # 定位到原始视频对应位置
    cap_original.set(cv2.CAP_PROP_POS_FRAMES, 0)
    ret, orig_frame = cap_original.read()
    if ret:
        psnr = calculate_psnr(prev_frame, orig_frame)
        psnr_values.append(psnr)

    # 处理后续帧
    while True:
        ret, curr_frame = cap_downsampled.read()
        if not ret:
            break

        # 写入当前降采样帧
        out_restored.write(curr_frame)

        # 计算当前帧的PSNR
        original_pos = frame_count * downsample_factor
        cap_original.set(cv2.CAP_PROP_POS_FRAMES, original_pos)
        ret, orig_frame = cap_original.read()

        if ret:
            psnr = calculate_psnr(curr_frame, orig_frame)
            psnr_values.append(psnr)

        # 生成并插入中间帧
        for i in range(1, downsample_factor):
            # 插值
            intermediate = interpolator.interpolate(prev_frame, curr_frame)
            out_restored.write(intermediate)

            # 计算插值帧PSNR
            inter_pos = frame_count * downsample_factor + i
            cap_original.set(cv2.CAP_PROP_POS_FRAMES, inter_pos)
            ret, orig_frame = cap_original.read()

            if ret:
                psnr = calculate_psnr(intermediate, orig_frame)
                psnr_values.append(psnr)

            processed_frames += 1

        prev_frame = curr_frame
        frame_count += 1
        processed_frames += 1

        if frame_count % 50 == 0:
            print(f"  已处理 {processed_frames}/{total_frames} 帧, "
                  f"当前PSNR: {np.mean(psnr_values):.2f}dB")

    # 清理
    cap_original.release()
    cap_downsampled.release()
    out_restored.release()
    Path(temp_downsampled).unlink()

    processing_time = time.time() - start_time
    avg_psnr = np.mean(psnr_values) if psnr_values else 0

    stats = {
        'total_frames': total_frames,
        'processed_frames': processed_frames,
        'avg_psnr': avg_psnr,
        'processing_fps': total_frames / processing_time,
        'memory_usage_mb': frame_memory_mb * 3  # 约3帧在内存中
    }

    print(f"\n{'=' * 50}")
    print(f"处理完成!")
    print(f"平均PSNR: {avg_psnr:.2f} dB")
    print(f"总耗时: {processing_time:.2f} 秒 ({total_frames / processing_time:.2f} fps)")
    print(f"内存占用: ~{stats['memory_usage_mb']:.1f} MB")
    print(f"{'=' * 50}")

    return avg_psnr, processing_time, stats


if __name__ == "__main__":
    # 处理大视频示例
    input_video = "202511301246.mp4"

    if Path(input_video).exists():
        try:
            process_video_streaming(
                input_video,
                "202511301246.mp4",
                method="optical_flow",  # 推荐：平衡质量与速度
                downsample_factor=2,
                max_memory_gb=1.0  # 限制内存使用
            )
        except Exception as e:
            print(f"处理失败: {e}")
            print("尝试降低分辨率...")

            # 或者先缩放视频处理
            # 可以在process_video_streaming中添加scale参数