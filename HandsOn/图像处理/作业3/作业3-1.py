import cv2
import numpy as np
import os
import glob

# ---------- 可调参数 ----------
MATCH_RATIO = 0.75  # Lowe's ratio阈值（略微放宽）
MIN_MATCH_COUNT = 15  # 最小匹配点数阈值
MATCH_RATE_THRESHOLD = 0.12  # 匹配率阈值
HAAR_PATH = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
# ------------------------------

face_cascade = cv2.CascadeClassifier(HAAR_PATH)
# 增强ORB特征提取器
orb = cv2.ORB_create(
    nfeatures=1000,  # 增加特征点数量
    scaleFactor=1.2,
    nlevels=8,
    edgeThreshold=31,
    firstLevel=0,
    WTA_K=2,
    scoreType=cv2.ORB_HARRIS_SCORE,
    patchSize=31
)
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)


def detect_face_roi(gray):
    """优化的人脸ROI检测"""
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,  # 降低scaleFactor提高检测精度
        minNeighbors=3,  # 降低minNeighbors增加检测灵敏度
        minSize=(30, 30),
        flags=cv2.CASCADE_SCALE_IMAGE
    )

    if len(faces) == 0:
        return None

    # 选择面积最大的人脸
    x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])

    # 扩展ROI区域以包含更多面部特征
    margin = int(min(w, h) * 0.1)
    x = max(0, x - margin)
    y = max(0, y - margin)
    w = min(gray.shape[1] - x, w + 2 * margin)
    h = min(gray.shape[0] - y, h + 2 * margin)

    roi = gray[y:y + h, x:x + w]
    return roi


def orb_features(roi):
    """增强的ORB特征提取"""
    if roi is None:
        return None, None

    # 预处理：直方图均衡化增强对比度
    roi_processed = cv2.equalizeHist(roi)

    kp, des = orb.detectAndCompute(roi_processed, None)

    # 如果特征点过少，尝试调整参数重新检测
    if kp is not None and len(kp) < 10:
        orb_alt = cv2.ORB_create(nfeatures=500, scoreType=cv2.ORB_FAST_SCORE)
        kp, des = orb_alt.detectAndCompute(roi_processed, None)

    return kp, des


def match_score(des1, des2):
    """改进的匹配得分计算"""
    if des1 is None or des2 is None or len(des1) < 2 or len(des2) < 2:
        return 0

    # 双向匹配确保准确性
    matches = bf.knnMatch(des1, des2, k=2)

    # Lowe's ratio test
    good_count = 0
    for pair in matches:
        if len(pair) == 2:
            m, n = pair
            if m.distance < MATCH_RATIO * n.distance:
                good_count += 1

    # 归一化得分：基于较小特征集的匹配率
    max_possible = min(len(des1), len(des2))
    if max_possible == 0:
        return 0

    normalized_score = (good_count / max_possible) * 100
    return int(normalized_score)


def compare_two_faces(path1, path2):
    """优化的两张照片比较函数"""
    img1 = cv2.imread(path1)
    img2 = cv2.imread(path2)
    if img1 is None or img2 is None:
        raise FileNotFoundError("图片读取失败，请检查路径")

    gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

    roi1 = detect_face_roi(gray1)
    roi2 = detect_face_roi(gray2)
    if roi1 is None or roi2 is None:
        print("未检测到人脸，无法比对")
        return 0

    _, des1 = orb_features(roi1)
    _, des2 = orb_features(roi2)
    score = match_score(des1, des2)
    print("匹配得分：", score)
    return score


def generate_match_matrix():
    """自动生成当前目录下所有PNG图像的匹配度矩阵"""
    # 查找当前目录下所有PNG格式的图像
    image_files = sorted(glob.glob("*.PNG"))
    if not image_files:
        print("当前目录未找到.PNG图像文件")
        return

    print(f"找到 {len(image_files)} 个.PNG图像文件:")
    for i, file in enumerate(image_files):
        print(f"{i + 1}. {file}")

    # 创建匹配度矩阵
    n = len(image_files)
    match_matrix = np.zeros((n, n), dtype=int)

    # 填充矩阵
    for i in range(n):
        for j in range(n):
            if i == j:
                # 同一张图片，显示特殊标记
                match_matrix[i][j] = -1  # 用-1表示同一张图片
            else:
                score = compare_two_faces(image_files[i], image_files[j])
                match_matrix[i][j] = score
                print(f"已比较: {image_files[i]} vs {image_files[j]} = {score} 匹配得分")

    # 输出结果
    print("\n匹配度矩阵 (-1表示同一张图片):")
    print("图片文件名:", image_files)
    print("矩阵:")
    print(match_matrix)

    # 判定结果
    print("\n判定结果 (阈值:{}):".format(MIN_MATCH_COUNT))
    for i in range(n):
        for j in range(i + 1, n):  # 只输出上三角部分避免重复
            result = "是" if match_matrix[i][j] >= MIN_MATCH_COUNT else "不是"
            print(f"{image_files[i]} vs {image_files[j]}: {result}同一人 ({match_matrix[i][j]}匹配得分)")


# ------------------ 命令行一键测试 ------------------
if __name__ == "__main__":
    import argparse, sys

    # 检查是否提供了命令行参数
    if len(sys.argv) > 1:
        parser = argparse.ArgumentParser(description="优化的零训练传统人脸识别")
        parser.add_argument("img1", help="第一张人像路径")
        parser.add_argument("img2", help="第二张人像路径")
        args = parser.parse_args()

        same = compare_two_faces(args.img1, args.img2)
        print("匹配得分：", same)
        print(">>> 判定结果：{}同一人 <<<".format("是" if same >= MIN_MATCH_COUNT else "不是"))
    else:
        # 如果没有命令行参数，则执行批量匹配
        generate_match_matrix()
