import cv2
import numpy as np
import tensorflow as tf
from tensorflow import keras
import os


class EmotionRecognitionModel:
    def __init__(self):
        # 情绪类别标签
        self.emotion_labels = {
            0: 'Angry（愤怒）',
            1: 'Disgust（厌恶）',
            2: 'Fear（恐惧）',
            3: 'Happy（开心）',
            4: 'Sad（伤心）',
            5: 'Surprise（惊讶）',
            6: 'Neutral（中性）'
        }

        # 颜色编码
        self.colors = {
            'Angry（愤怒）': (0, 0, 255),
            'Disgust（厌恶）': (0, 128, 0),
            'Fear（恐惧）': (128, 0, 128),
            'Happy（开心）': (0, 255, 255),
            'Sad（伤心）': (255, 0, 0),
            'Surprise（惊讶）': (255, 165, 0),
            'Neutral（中性）': (128, 128, 128)
        }

        # 加载OpenCV人脸检测器（比MTCNN更稳定）
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )

        # 加载模型
        self.model = self.load_model()

    def load_model(self):
        """加载或创建模型"""
        model_path = 'models/emotion_model.h5'

        # 如果模型文件存在，尝试加载
        if os.path.exists(model_path):
            try:
                model = keras.models.load_model(model_path)
                print("✓ 加载预训练模型成功")
                return model
            except Exception as e:
                print(f"⚠ 无法加载现有模型: {e}")
                print("将创建新模型...")

        # 创建新模型 - 使用与init_model.py一致的结构
        model = keras.Sequential([
            keras.layers.Conv2D(32, (3, 3), activation='relu', input_shape=(48, 48, 1)),
            keras.layers.MaxPooling2D((2, 2)),
            keras.layers.Flatten(),
            keras.layers.Dense(64, activation='relu'),
            keras.layers.Dense(7, activation='softmax')
        ])

        # 编译模型
        model.compile(
            optimizer='adam',
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )

        # 保存模型
        os.makedirs('models', exist_ok=True)
        model.save(model_path, save_format='h5')
        print(f"✓ 已创建新模型并保存到: {model_path}")

        return model

    def detect_faces(self, image):
        """使用OpenCV检测人脸"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE
        )

        results = []
        for i, (x, y, w, h) in enumerate(faces):
            # 扩展人脸区域
            padding = 20
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(image.shape[1], x + w + padding)
            y2 = min(image.shape[0], y + h + padding)

            results.append({
                'id': i + 1,
                'box': {'x': int(x1), 'y': int(y1), 'width': int(x2 - x1), 'height': int(y2 - y1)}
            })

        return results

    def preprocess_face(self, image, face_box):
        """预处理人脸"""
        x, y, w, h = face_box['x'], face_box['y'], face_box['width'], face_box['height']

        # 提取人脸区域
        face_roi = image[y:y + h, x:x + w]

        # 转换为灰度图
        if len(face_roi.shape) == 3:
            gray_face = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
        else:
            gray_face = face_roi

        # 调整大小
        resized_face = cv2.resize(gray_face, (48, 48))

        # 归一化
        normalized_face = resized_face / 255.0

        # 增加维度
        processed_face = np.expand_dims(normalized_face, axis=-1)  # (48, 48, 1)
        processed_face = np.expand_dims(processed_face, axis=0)  # (1, 48, 48, 1)

        return processed_face

    def predict_emotion(self, image):
        """识别表情"""
        # 检测人脸
        faces = self.detect_faces(image)

        results = []
        for face in faces:
            try:
                # 预处理
                processed_face = self.preprocess_face(image, face['box'])

                # 预测
                predictions = self.model.predict(processed_face, verbose=0)
                emotion_idx = np.argmax(predictions[0])
                emotion = self.emotion_labels.get(emotion_idx, 'Neutral（中性）')
                confidence = float(predictions[0][emotion_idx]) * 100

                # 添加到结果
                face['emotion'] = emotion
                face['confidence'] = round(confidence, 2)

                # 生成所有情绪的概率
                all_probabilities = {}
                for i, prob in enumerate(predictions[0]):
                    emotion_name = self.emotion_labels.get(i, f'Emotion_{i}')
                    all_probabilities[emotion_name] = float(prob) * 100

                face['all_probabilities'] = all_probabilities
                results.append(face)
            except Exception as e:
                print(f"处理人脸时出错: {e}")
                continue

        return results

    def annotate_image(self, image, results):
        """标注图像"""
        annotated_image = image.copy()

        for result in results:
            box = result['box']
            emotion = result['emotion']
            confidence = result['confidence']

            # 获取颜色
            color = self.colors.get(emotion, (255, 255, 255))

            # 绘制框
            x, y, w, h = box['x'], box['y'], box['width'], box['height']
            cv2.rectangle(annotated_image, (x, y), (x + w, y + h), color, 2)

            # 绘制标签
            label = f"{emotion.split('（')[0]} {confidence:.1f}%"
            font_scale = 0.6
            thickness = 2

            # 计算文字大小
            (text_width, text_height), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness
            )

            # 绘制文字背景
            cv2.rectangle(
                annotated_image,
                (x, y - text_height - 10),
                (x + text_width, y),
                color,
                -1
            )

            # 绘制文字
            cv2.putText(
                annotated_image,
                label,
                (x, y - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                font_scale,
                (255, 255, 255),
                thickness
            )

        return annotated_image


# 创建全局模型实例
emotion_model = EmotionRecognitionModel()