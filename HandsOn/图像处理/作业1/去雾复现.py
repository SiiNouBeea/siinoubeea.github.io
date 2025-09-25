import cv2
import numpy as np
import matplotlib.pyplot as plt
import sys
import os

# -------------------- 1. 暗通道 --------------------
def dark_channel(im, patch=15):
    """输入 BGR uint8/float32 均可，返回暗通道 float32"""
    b, g, r = cv2.split(im)
    dc = cv2.min(cv2.min(r, g), b)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (patch, patch))
    dc = cv2.erode(dc, kernel)          # 等效于 min-pool
    return dc.astype(np.float32)

# -------------------- 2. 大气光 A --------------------
def estimate_A(im, dc, ratio=0.001):
    """Top-0.1% 亮度像素对应的原图平均颜色作为 A"""
    h, w = dc.shape
    num = max(int(h * w * ratio), 1)
    flat = dc.reshape(-1)
    indices = np.argpartition(flat, -num)[-num:]   # 最快的 Top-K
    rows, cols = np.unravel_index(indices, (h, w))
    A = np.mean(im[rows, cols], axis=0)            # BGR 3 维
    return A

# -------------------- 3. 透射图粗估计 --------------------
def transmission_estimate(im, A, omega=0.95, patch=15):  # 增强去雾效果：提高omega值
    """t~(x)=1-ω·min_{y∈Ω}(I^c(y)/A^c)"""
    tmp = np.empty_like(im, dtype=np.float32)
    for c in range(3):
        tmp[:, :, c] = im[:, :, c] / A[c]
    t = 1 - omega * dark_channel(tmp, patch)
    return t

# -------------------- 4. 导向滤波细化 --------------------
def guided_filter(p, I, r=60, eps=1e-6):  # 增强去雾效果：增大滤波半径，减小eps
    """快速导向滤波，I 为灰度 guide，p 为输入，返回 q"""
    I = I.astype(np.float32)
    mean_I = cv2.boxFilter(I, -1, (r, r))
    mean_p = cv2.boxFilter(p, -1, (r, r))
    mean_Ip = cv2.boxFilter(I * p, -1, (r, r))
    cov_Ip = mean_Ip - mean_I * mean_p

    mean_II = cv2.boxFilter(I * I, -1, (r, r))
    var_I = mean_II - mean_I * mean_I
    a = cov_Ip / (var_I + eps)
    b = mean_p - a * mean_I

    mean_a = cv2.boxFilter(a, -1, (r, r))
    mean_b = cv2.boxFilter(b, -1, (r, r))
    q = mean_a * I + mean_b
    return q

# -------------------- 5. 复原 J --------------------
def recover(im, t, A, t0=0.3):  # 增强去雾效果：降低t0值
    t = np.clip(t, t0, 1)[:, :, np.newaxis]
    J = (im.astype(np.float32) - A) / t + A
    return np.clip(J, 0, 255).astype(np.uint8)

# -------------------- 6. 一键去雾 --------------------
def dehaze(image_path, save_path='dehaze.jpg'):
    # 检查文件是否存在
    if not os.path.exists(image_path):
        print(f'图像文件不存在: {image_path}')
        print(f'当前工作目录: {os.getcwd()}')
        print(f'目录中的文件: {os.listdir(os.path.dirname(image_path)) if os.path.dirname(image_path) else os.listdir(".")}')
        sys.exit(1)
    
    # 增强文件检查
    if not os.path.isfile(image_path):
        print(f'路径存在但不是文件: {image_path}')
        sys.exit(1)
        
    if not os.access(image_path, os.R_OK):
        print(f'文件存在但无法读取 (权限不足): {image_path}')
        sys.exit(1)
    
    # 检查文件大小
    file_size = os.path.getsize(image_path)
    if file_size == 0:
        print(f'文件存在但大小为0字节: {image_path}')
        sys.exit(1)
    
    print(f'文件检查通过: {image_path}')
    print(f'文件大小: {file_size} 字节')
    
    # 尝试以二进制模式打开文件
    try:
        with open(image_path, 'rb') as f:
            header = f.read(10)
            print(f'文件头部信息: {header}')
    except Exception as e:
        print(f'无法以二进制模式读取文件: {e}')
        sys.exit(1)
    
    # 规范化路径，避免特殊字符问题
    image_path = os.path.normpath(image_path)
    
    # 首先尝试使用OpenCV读取
    im = cv2.imread(image_path)
    
    # 如果OpenCV读取失败，尝试使用matplotlib
    if im is None:
        print(f'OpenCV无法读取图像: {image_path}')
        print('尝试使用matplotlib读取...')
        try:
            # 使用matplotlib读取图像
            img_rgb = plt.imread(image_path)
            # 如果是RGB格式，转换为BGR
            if len(img_rgb.shape) == 3 and img_rgb.shape[2] >= 3:
                im = cv2.cvtColor((img_rgb * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
            else:
                im = (img_rgb * 255).astype(np.uint8)
            print('matplotlib读取成功')
        except Exception as e:
            print(f'matplotlib也无法读取图像: {e}')
            print('可能的原因:')
            print('1. 文件格式不被支持')
            print('2. 文件已损坏')
            print('3. 文件路径包含特殊字符')
            # 尝试获取支持的格式
            try:
                build_info = cv2.getBuildInformation()
                if 'JPEG' in build_info:
                    print('OpenCV支持JPEG格式')
                else:
                    print('OpenCV可能不支持JPEG格式')
            except:
                print('无法获取OpenCV构建信息')
            sys.exit(1)

    dc = dark_channel(im)
    A = estimate_A(im, dc, ratio=0.0005)  # 增强去雾效果：减少用于估计大气光的像素比例
    t = transmission_estimate(im, A, omega=0.95)  # 增强去雾效果：提高omega值
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    t_ref = guided_filter(t, gray, r=60, eps=1e-6)  # 增强去雾效果：优化导向滤波参数
    J = recover(im, t_ref, A, t0=0.1)  # 增强去雾效果：降低t0值以增强去雾强度

    cv2.imwrite(save_path, J)
    print(f'已保存去雾结果 → {save_path}')
    # 简单可视化
    plt.figure(figsize=(12, 6))
    plt.subplot(1, 2, 1); plt.imshow(cv2.cvtColor(im, cv2.COLOR_BGR2RGB)); plt.title('Hazy'); plt.axis('off')
    plt.subplot(1, 2, 2); plt.imshow(cv2.cvtColor(J, cv2.COLOR_BGR2RGB)); plt.title('Dehazed'); plt.axis('off')
    plt.show()

# -------------------- 7. 直接运行 --------------------
if __name__ == '__main__':
    # 使用相对路径或绝对路径
    image_file = '带雾5.png'
    # 获取脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(script_dir, image_file)
    
    # 规范化路径
    image_path = os.path.normpath(image_path)
    
    dehaze(image_path)