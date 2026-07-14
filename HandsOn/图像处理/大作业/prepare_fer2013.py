import pandas as pd
import numpy as np
import os
import requests
import zipfile
import warnings

warnings.filterwarnings('ignore')
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
import tensorflow as tf
from tensorflow import keras

print("TensorFlow版本:", tf.__version__)


class FER2013DataLoader:
    """FER2013数据加载器"""

    def __init__(self, data_path='fer2013.csv'):
        self.data_path = data_path
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
            'Angry（愤怒）': '#e74c3c',
            'Disgust（厌恶）': '#2ecc71',
            'Fear（恐惧）': '#9b59b6',
            'Happy（开心）': '#f1c40f',
            'Sad（伤心）': '#3498db',
            'Surprise（惊讶）': '#e67e22',
            'Neutral（中性）': '#95a5a6'
        }

    def download_dataset(self):
        """下载FER2013数据集"""
        print("正在下载FER2013数据集...")

        # Kaggle下载链接（需要kaggle账号）
        kaggle_url = "https://www.kaggle.com/c/3364/download"

        # 备选GitHub源（小样本）
        github_urls = [
            "https://raw.githubusercontent.com/microsoft/FERPlus/master/data/fer2013.csv",
            "https://github.com/MichaelKingWill/HandsOn/raw/main/data/fer2013_sample.csv"
        ]

        for url in github_urls:
            try:
                print(f"尝试从 {url} 下载...")
                response = requests.get(url, timeout=30)
                if response.status_code == 200:
                    with open(self.data_path, 'wb') as f:
                        f.write(response.content)
                    print(f"✓ 数据集下载成功: {self.data_path}")
                    return True
            except Exception as e:
                print(f"下载失败: {e}")
                continue

        print("⚠ 无法从网络下载，将使用模拟数据")
        return False

    def create_mock_data(self, n_samples=10000):
        """创建模拟数据用于测试"""
        print("创建模拟数据...")

        # 创建模拟数据集
        data = []
        emotions = [0, 1, 2, 3, 4, 5, 6]
        emotion_probs = [0.1, 0.05, 0.1, 0.3, 0.15, 0.1, 0.2]  # 各类别概率

        for i in range(n_samples):
            emotion = np.random.choice(emotions, p=emotion_probs)

            # 创建像素数据（48x48）
            pixels = []
            if emotion == 3:  # Happy - 较亮
                base = np.random.randint(150, 230, 48 * 48)
            elif emotion == 4:  # Sad - 较暗
                base = np.random.randint(30, 120, 48 * 48)
            else:
                base = np.random.randint(50, 200, 48 * 48)

            # 添加噪声
            noise = np.random.randint(-20, 20, 48 * 48)
            pixels = base + noise
            pixels = np.clip(pixels, 0, 255).astype(int)

            pixels_str = ' '.join(map(str, pixels))

            # 分配Usage
            usage_rand = np.random.random()
            if usage_rand < 0.8:
                usage = 'Training'
            elif usage_rand < 0.9:
                usage = 'PublicTest'
            else:
                usage = 'PrivateTest'

            data.append([emotion, pixels_str, usage])

        df = pd.DataFrame(data, columns=['emotion', 'pixels', 'Usage'])
        df.to_csv(self.data_path, index=False)
        print(f"✓ 模拟数据已保存: {self.data_path}")
        return df

    def load_data(self):
        """加载数据"""
        if not os.path.exists(self.data_path):
            print("数据文件不存在，尝试下载...")
            if not self.download_dataset():
                print("下载失败，创建模拟数据...")
                self.create_mock_data(5000)

        print(f"正在加载数据: {self.data_path}")
        df = pd.read_csv(self.data_path)
        print(f"数据加载完成，大小: {df.shape}")

        # 检查数据列
        print(f"数据列: {df.columns.tolist()}")
        print(f"情绪分布:")
        print(df['emotion'].value_counts().sort_index())

        return df

    def preprocess_data(self, df):
        """数据预处理"""
        print("\n数据预处理...")

        def pixels_to_array(pixel_str):
            """将像素字符串转换为数组"""
            try:
                pixel_list = list(map(int, pixel_str.split()))
                return np.array(pixel_list, dtype=np.uint8)
            except:
                # 如果格式错误，返回随机数组
                return np.random.randint(0, 255, 48 * 48, dtype=np.uint8)

        # 转换像素数据
        df['pixels_array'] = df['pixels'].apply(pixels_to_array)

        # 分离数据集
        train_df = df[df['Usage'] == 'Training']
        val_df = df[df['Usage'] == 'PublicTest']
        test_df = df[df['Usage'] == 'PrivateTest']

        print(f"训练集: {len(train_df)} 样本")
        print(f"验证集: {len(val_df)} 样本")
        print(f"测试集: {len(test_df)} 样本")

        # 转换为numpy数组
        X_train = np.vstack(train_df['pixels_array'].values).reshape(-1, 48, 48, 1)
        y_train = train_df['emotion'].values

        X_val = np.vstack(val_df['pixels_array'].values).reshape(-1, 48, 48, 1)
        y_val = val_df['emotion'].values

        X_test = np.vstack(test_df['pixels_array'].values).reshape(-1, 48, 48, 1)
        y_test = test_df['emotion'].values

        # 归一化
        X_train = X_train.astype('float32') / 255.0
        X_val = X_val.astype('float32') / 255.0
        X_test = X_test.astype('float32') / 255.0

        # One-hot编码
        y_train = keras.utils.to_categorical(y_train, 7)
        y_val = keras.utils.to_categorical(y_val, 7)
        y_test = keras.utils.to_categorical(y_test, 7)

        print(f"训练数据形状: X={X_train.shape}, y={y_train.shape}")
        print(f"验证数据形状: X={X_val.shape}, y={y_val.shape}")

        return X_train, y_train, X_val, y_val, X_test, y_test

    def analyze_dataset(self, df):
        """分析数据集"""
        print("\n数据集分析:")
        print("=" * 50)

        # 总体统计
        total_samples = len(df)
        print(f"总样本数: {total_samples}")

        # 情绪分布
        emotion_dist = df['emotion'].value_counts().sort_index()
        print("\n情绪分布:")
        for emotion_idx, count in emotion_dist.items():
            emotion_name = self.emotion_labels.get(emotion_idx, f"Unknown({emotion_idx})")
            percentage = count / total_samples * 100
            print(f"  {emotion_name}: {count} ({percentage:.1f}%)")

        # 数据集分割
        usage_dist = df['Usage'].value_counts()
        print("\n数据集分割:")
        for usage, count in usage_dist.items():
            percentage = count / total_samples * 100
            print(f"  {usage}: {count} ({percentage:.1f}%)")

        # 可视化
        self.visualize_data(df)

    def visualize_data(self, df, num_samples=25):
        """可视化数据样本"""
        print("\n可视化数据样本...")

        # 随机选择样本
        sample_df = df.sample(min(num_samples, len(df)))

        # 创建子图
        fig, axes = plt.subplots(5, 5, figsize=(15, 15))
        axes = axes.flatten()

        for idx, (_, row) in enumerate(sample_df.iterrows()):
            if idx < len(axes):
                ax = axes[idx]

                # 获取像素数据
                pixels = list(map(int, row['pixels'].split()))
                img = np.array(pixels, dtype=np.uint8).reshape(48, 48)

                # 获取情绪标签
                emotion_idx = row['emotion']
                emotion_name = self.emotion_labels.get(emotion_idx, f"Emotion_{emotion_idx}")
                color = self.emotion_colors.get(emotion_name, '#000000')

                # 显示图像
                ax.imshow(img, cmap='gray')
                ax.set_title(emotion_name, color=color, fontsize=10)
                ax.axis('off')

        # 隐藏多余的子图
        for idx in range(len(sample_df), len(axes)):
            axes[idx].axis('off')

        plt.suptitle('FER2013 Dataset Samples', fontsize=16, y=1.02)
        plt.tight_layout()
        plt.savefig('fer2013_samples.png', dpi=150, bbox_inches='tight')
        plt.show()

        # 绘制情绪分布图
        self.plot_emotion_distribution(df)

    def plot_emotion_distribution(self, df):
        """绘制情绪分布图"""
        emotion_dist = df['emotion'].value_counts().sort_index()
        emotion_names = [self.emotion_labels[i] for i in emotion_dist.index]
        colors = [self.emotion_colors.get(name, '#95a5a6') for name in emotion_names]

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

        # 条形图
        bars = ax1.bar(emotion_names, emotion_dist.values, color=colors)
        ax1.set_title('FER2013 Emotion Distribution', fontsize=14)
        ax1.set_xlabel('Emotion')
        ax1.set_ylabel('Count')
        ax1.tick_params(axis='x', rotation=45)

        # 在条形上添加数量
        for bar, count in zip(bars, emotion_dist.values):
            height = bar.get_height()
            ax1.text(bar.get_x() + bar.get_width() / 2., height + 50,
                     f'{count}', ha='center', va='bottom')

        # 饼图
        wedges, texts, autotexts = ax2.pie(emotion_dist.values, labels=emotion_names,
                                           colors=colors, autopct='%1.1f%%', startangle=90)
        ax2.set_title('Emotion Proportion', fontsize=14)

        plt.tight_layout()
        plt.savefig('fer2013_distribution.png', dpi=150, bbox_inches='tight')
        plt.show()


def main():
    """主函数：准备数据"""
    print("=" * 60)
    print("FER2013 数据集准备")
    print("=" * 60)

    # 初始化数据加载器
    loader = FER2013DataLoader()

    # 加载数据
    df = loader.load_data()

    # 分析数据集
    loader.analyze_dataset(df)

    # 预处理数据
    X_train, y_train, X_val, y_val, X_test, y_test = loader.preprocess_data(df)

    # 保存预处理的数据
    np.savez_compressed('fer2013_preprocessed.npz',
                        X_train=X_train, y_train=y_train,
                        X_val=X_val, y_val=y_val,
                        X_test=X_test, y_test=y_test)

    print("\n" + "=" * 60)
    print("数据准备完成！")
    print("已保存预处理数据到: fer2013_preprocessed.npz")
    print("=" * 60)

    return X_train, y_train, X_val, y_val, X_test, y_test


if __name__ == "__main__":
    main()