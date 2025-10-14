import cv2
import numpy as np

# ---------- 可调参数 ----------
MATCH_RATIO = 0.7        # 最近邻比率阈值（Lowe's ratio）
MIN_MATCH_COUNT = 10     # 认为“同一人”至少需要的合格匹配点对
HAAR_PATH = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
# ------------------------------

face_cascade = cv2.CascadeClassifier(HAAR_PATH)
orb = cv2.ORB_create(nfeatures=500)   # 传统 ORB 特征
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

def detect_face_roi(gray):
    """返回最大人脸 ROI（灰度图），若未检测到返回 None"""
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5)
    if len(faces) == 0:
        return None
    # 选面积最大的人脸
    x, y, w, h = max(faces, key=lambda rect: rect[2]*rect[3])
    roi = gray[y:y+h, x:x+w]
    return roi

def orb_features(roi):
    """计算 ORB 关键点和描述子"""
    kp, des = orb.detectAndCompute(roi, None)
    return kp, des

def match_score(des1, des2):
    """返回匹配得分：合格点对数量"""
    if des1 is None or des2 is None:
        return 0
    matches = bf.knnMatch(des1, des2, k=2)
    good = 0
    for m_n in matches:
        if len(m_n) == 2:
            m, n = m_n
            if m.distance < MATCH_RATIO * n.distance:
                good += 1
    return good

def compare_two_faces(path1, path2):
    """主接口：两张照片 -> 是否同一人"""
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
        return False

    _, des1 = orb_features(roi1)
    _, des2 = orb_features(roi2)
    score = match_score(des1, des2)
    print("合格匹配点数：", score)
    return score >= MIN_MATCH_COUNT

# ------------------ 命令行一键测试 ------------------
if __name__ == "__main__":
    import argparse, sys
    parser = argparse.ArgumentParser(description="零训练传统人脸识别")
    parser.add_argument("img1", help="第一张人像路径")
    parser.add_argument("img2", help="第二张人像路径")
    args = parser.parse_args()

    same = compare_two_faces(args.img1, args.img2)
    print(">>> 判定结果：{}同一人 <<<".format("是" if same else "不是"))