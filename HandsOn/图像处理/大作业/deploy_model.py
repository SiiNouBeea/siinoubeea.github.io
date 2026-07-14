import tensorflow as tf
from tensorflow import keras
import numpy as np
import cv2
import os
import json


class DeployedEmotionModel:
    """部署的表情识别模型"""

    def __init__(self, model_path='best_emotion_model.h5'):
        self.model_path = model_path
        self.model = None
        self.emotion_labels = None
        self.emotion_colors = None
        self.face_cascade = None

        # 加载模型和配置
        self.load_model()
        self.load_label_mapping()
        self.load_face_detector()

    def load_model(self):
        """加载训练好的模型"""
        print(f"加载模型: {self.model_path}")

        if os.path.exists(self.model_path):
            try:
                self.model = keras.models.load_model(self.model_path)
                print("✓ 模型加载成功")
            except Exception as e:
                print(f"⚠ 加载模型失败: {e}")
                print("将使用备用模型...")
                self.model = self.create_backup_model()
        else:
            print(f"⚠ 模型文件不存在: {self.model_path}")
            print("将使用备用模型...")
            self.model = self.create_backup_model()

        # 测试模型
        test_input = np.random.rand(1, 48, 48, 1).astype(np.float32)
        prediction = self.model.predict(test_input, verbose=0)
        print(f"✓ 模型测试成功，输出形状: {prediction.shape}")

    def create_backup_model(self):
        """创建备用模型"""
        print("创建备用模型...")

        model = keras.Sequential([
            keras.layers.Conv2D(32, (3, 3), activation='relu', input_shape=(48, 48, 1)),
            keras.layers.MaxPooling2D((2, 2)),
            keras.layers.Conv2D(64, (3, 3), activation='relu'),
            keras.layers.MaxPooling2D((2, 2)),
            keras.layers.Flatten(),
            keras.layers.Dense(128, activation='relu'),
            keras.layers.Dropout(0.5),
            keras.layers.Dense(7, activation='softmax')
        ])

        model.compile(
            optimizer='adam',
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )

        return model

    def load_label_mapping(self):
        """加载标签映射"""
        label_file = 'label_mapping.json'

        if os.path.exists(label_file):
            try:
                with open(label_file, 'r', encoding='utf-8') as f:
                    label_mapping = json.load(f)
                self.emotion_labels = label_mapping.get('emotion_labels', {})
                self.emotion_colors = label_mapping.get('emotion_colors', {})
                print("✓ 标签映射加载成功")
            except:
                print("⚠ 加载标签映射失败，使用默认映射")
                self.load_default_labels()
        else:
            print("⚠ 标签映射文件不存在，使用默认映射")
            self.load_default_labels()

    def load_default_labels(self):
        """加载默认标签映射"""
        self.emotion_labels = {
            0: 'Angry（愤怒）',
            1: 'Disgust（厌恶）',
            2: 'Fear（恐惧）',
            3: 'Happy（开心）',
            4: 'Sad（伤心）',
            5: 'Surprise（惊讶）',
            6: 'Neutral（中性）'
        }

        self.emotion_colors = {
            'Angry（愤怒）': (0, 0, 255),
            'Disgust（厌恶）': (0, 128, 0),
            'Fear（恐惧）': (128, 0, 128),
            'Happy（开心）': (0, 255, 255),
            'Sad（伤心）': (255, 0, 0),
            'Surprise（惊讶）': (255, 165, 0),
            'Neutral（中性）': (128, 128, 128)
        }

    def load_face_detector(self):
        """加载人脸检测器"""
        try:
            # 加载OpenCV人脸检测器
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self.face_cascade = cv2.CascadeClassifier(cascade_path)

            if self.face_cascade.empty():
                # 尝试加载其他检测器
                alt_paths = [
                    'haarcascade_frontalface_alt.xml',
                    'haarcascade_frontalface_alt2.xml',
                    'haarcascade_frontalface_alt_tree.xml'
                ]

                for alt_path in alt_paths:
                    cascade_path = cv2.data.haarcascades + alt_path
                    self.face_cascade = cv2.CascadeClassifier(cascade_path)
                    if not self.face_cascade.empty():
                        break

            if not self.face_cascade.empty():
                print("✓ 人脸检测器加载成功")
            else:
                print("⚠ 无法加载人脸检测器，将使用简单的检测方法")
        except:
            print("⚠ 加载人脸检测器失败，将使用简单的检测方法")

    def preprocess_face(self, face_roi):
        """预处理人脸图像"""
        # 转换为灰度图
        if len(face_roi.shape) == 3:
            gray_face = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
        else:
            gray_face = face_roi

        # 调整大小到48x48
        resized_face = cv2.resize(gray_face, (48, 48))

        # 归一化
        normalized_face = resized_face.astype('float32') / 255.0

        # 增加维度
        processed_face = np.expand_dims(normalized_face, axis=-1)  # (48, 48, 1)
        processed_face = np.expand_dims(processed_face, axis=0)  # (1, 48, 48, 1)

        return processed_face

    def detect_faces(self, image):
        """检测图像中的人脸"""
        faces = []

        if self.face_cascade is not None and not self.face_cascade.empty():
            # 使用OpenCV检测
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            detected_faces = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )

            for i, (x, y, w, h) in enumerate(detected_faces):
                # 扩展边界框
                padding = 20
                x1 = max(0, x - padding)
                y1 = max(0, y - padding)
                x2 = min(image.shape[1], x + w + padding)
                y2 = min(image.shape[0], y + h + padding)

                faces.append({
                    'id': i + 1,
                    'box': {'x': x1, 'y': y1, 'width': x2 - x1, 'height': y2 - y1}
                })
        else:
            # 简单的检测方法（用于测试）
            height, width = image.shape[:2]
            faces.append({
                'id': 1,
                'box': {'x': width // 4, 'y': height // 4,
                        'width': width // 2, 'height': height // 2}
            })

        return faces

    def predict_emotion(self, image):
        """识别图像中的表情"""
        # 检测人脸
        faces = self.detect_faces(image)
        results = []

        for face in faces:
            try:
                # 提取人脸区域
                box = face['box']
                x, y, w, h = box['x'], box['y'], box['width'], box['height']
                face_roi = image[y:y + h, x:x + w]

                # 预处理
                processed_face = self.preprocess_face(face_roi)

                # 预测
                predictions = self.model.predict(processed_face, verbose=0)
                emotion_idx = np.argmax(predictions[0])
                emotion = self.emotion_labels.get(emotion_idx, 'Neutral（中性）')
                confidence = float(predictions[0][emotion_idx]) * 100

                # 收集所有情绪的概率
                all_probabilities = {}
                for i, prob in enumerate(predictions[0]):
                    emotion_name = self.emotion_labels.get(i, f'Emotion_{i}')
                    all_probabilities[emotion_name] = float(prob) * 100

                # 添加到结果
                face['emotion'] = emotion
                face['confidence'] = round(confidence, 2)
                face['all_probabilities'] = all_probabilities
                results.append(face)

            except Exception as e:
                print(f"处理人脸时出错: {e}")
                continue

        return results

    def annotate_image(self, image, results):
        """在图像上标注结果"""
        annotated_image = image.copy()

        for result in results:
            box = result['box']
            emotion = result['emotion']
            confidence = result['confidence']

            # 获取颜色
            color_name = emotion
            if color_name not in self.emotion_colors:
                # 尝试去除括号部分
                color_name = emotion.split('（')[0] if '（' in emotion else emotion

            color = self.emotion_colors.get(color_name, (255, 255, 255))
            if isinstance(color, str):
                # 如果是十六进制颜色，转换为BGR
                if color.startswith('#'):
                    hex_color = color.lstrip('#')
                    rgb = tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
                    color = (rgb[2], rgb[1], rgb[0])  # RGB to BGR
                else:
                    color = (255, 255, 255)

            # 绘制边界框
            x, y, w, h = box['x'], box['y'], box['width'], box['height']
            cv2.rectangle(annotated_image, (x, y), (x + w, y + h), color, 2)

            # 绘制标签背景
            label = f"{emotion.split('（')[0]} {confidence:.1f}%"
            font_scale = 0.6
            thickness = 2

            (text_width, text_height), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness
            )

            # 绘制背景矩形
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

    def process_image_file(self, image_path):
        """处理图像文件"""
        print(f"处理图像: {image_path}")

        # 读取图像
        image = cv2.imread(image_path)
        if image is None:
            print(f"无法读取图像: {image_path}")
            return None

        # 识别表情
        results = self.predict_emotion(image)

        # 标注图像
        annotated_image = self.annotate_image(image, results)

        # 保存结果
        result_path = image_path.replace('.', '_result.')
        cv2.imwrite(result_path, annotated_image)

        print(f"✓ 处理完成，结果保存到: {result_path}")
        print(f"检测到 {len(results)} 个人脸")

        for result in results:
            print(f"  人脸 {result['id']}: {result['emotion']} ({result['confidence']}%)")

        return result_path, results


def main():
    """测试部署的模型"""
    print("=" * 60)
    print("表情识别模型部署测试")
    print("=" * 60)

    # 初始化模型
    model = DeployedEmotionModel()

    # 测试图像
    test_images = [
        'test_image.jpg',
        'sample.jpg',
        'face.jpg'
    ]

    for img_file in test_images:
        if os.path.exists(img_file):
            print(f"\n处理测试图像: {img_file}")
            result_path, results = model.process_image_file(img_file)

            if result_path:
                print(f"结果图像: {result_path}")
        else:
            print(f"测试图像不存在: {img_file}")

    print("\n" + "=" * 60)
    print("模型部署测试完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()