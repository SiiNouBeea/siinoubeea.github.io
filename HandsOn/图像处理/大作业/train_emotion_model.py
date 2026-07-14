# train_emotion_model_optimized.py
import numpy as np
import tensorflow as tf
from tensorflow import keras
from sklearn.utils.class_weight import compute_class_weight
from tensorflow.keras import layers, models, callbacks, regularizers
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix
import os
import time
import json

print("TensorFlow版本:", tf.__version__)


class EmotionModelTrainer:
    """表情识别模型训练器 - 优化版"""

    def __init__(self, input_shape=(48, 48, 1), num_classes=7):
        self.input_shape = input_shape
        self.num_classes = num_classes

        # 情绪标签
        self.emotion_labels = {
            0: 'Angry（愤怒）',
            1: 'Disgust（厌恶）',
            2: 'Fear（恐惧）',
            3: 'Happy（开心）',
            4: 'Sad（伤心）',
            5: 'Surprise（惊讶）',
            6: 'Neutral（中性）'
        }

        # 颜色映射
        self.emotion_colors = {
            'Angry（愤怒）': '#e74c3c',
            'Disgust（厌恶）': '#2ecc71',
            'Fear（恐惧）': '#9b59b6',
            'Happy（开心）': '#f1c40f',
            'Sad（伤心）': '#3498db',
            'Surprise（惊讶）': '#e67e22',
            'Neutral（中性）': '#95a5a6'
        }

    def load_preprocessed_data(self, data_path='fer2013_preprocessed.npz'):
        """加载预处理的数据"""
        print(f"加载预处理数据: {data_path}")

        if not os.path.exists(data_path):
            raise FileNotFoundError(f"数据文件不存在: {data_path}")

        data = np.load(data_path)
        X_train = data['X_train']
        y_train = data['y_train']
        X_val = data['X_val']
        y_val = data['y_val']
        X_test = data['X_test']
        y_test = data['y_test']

        print(f"训练数据: X={X_train.shape}, y={y_train.shape}")
        print(f"验证数据: X={X_val.shape}, y={y_val.shape}")
        print(f"测试数据: X={X_test.shape}, y={y_test.shape}")

        return X_train, y_train, X_val, y_val, X_test, y_test

    def create_enhanced_data_generators(self, X_train, y_train, X_val, y_val, batch_size=64):
        """创建增强版数据生成器（带增强）"""
        print("创建增强版数据生成器...")

        # 训练数据生成器（增强版）
        train_datagen = keras.preprocessing.image.ImageDataGenerator(
            rotation_range=20,  # 随机旋转角度
            width_shift_range=0.2,  # 水平平移
            height_shift_range=0.2,  # 垂直平移
            shear_range=0.2,  # 剪切变换
            zoom_range=0.2,  # 随机缩放
            horizontal_flip=True,  # 水平翻转
            brightness_range=[0.8, 1.2],  # 亮度调整
            fill_mode='nearest'  # 填充模式
        )

        # 验证数据生成器（仅标准化）
        val_datagen = keras.preprocessing.image.ImageDataGenerator()

        # 创建生成器
        train_generator = train_datagen.flow(
            X_train, y_train,
            batch_size=batch_size,
            shuffle=True
        )

        val_generator = val_datagen.flow(
            X_val, y_val,
            batch_size=batch_size,
            shuffle=False
        )

        return train_generator, val_generator

    def build_optimized_cnn(self):
        """构建优化的CNN模型"""
        print("构建优化CNN模型...")

        model = models.Sequential([
            # 第一卷积块
            layers.Conv2D(32, (3, 3), activation='relu', input_shape=self.input_shape),
            layers.BatchNormalization(),
            layers.Conv2D(32, (3, 3), activation='relu'),
            layers.MaxPooling2D((2, 2)),
            layers.Dropout(0.25),

            # 第二卷积块
            layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
            layers.MaxPooling2D((2, 2)),
            layers.Dropout(0.25),

            # 第三卷积块
            layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
            layers.MaxPooling2D((2, 2)),
            layers.Dropout(0.25),

            # 第四卷积块
            layers.Conv2D(256, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv2D(256, (3, 3), activation='relu', padding='same'),
            layers.MaxPooling2D((2, 2)),
            layers.Dropout(0.25),

            # 全局池化层
            layers.GlobalAveragePooling2D(),

            # 全连接层
            layers.Dense(512, activation='relu'),
            layers.BatchNormalization(),
            layers.Dropout(0.5),

            layers.Dense(256, activation='relu'),
            layers.BatchNormalization(),
            layers.Dropout(0.5),

            # 输出层
            layers.Dense(self.num_classes, activation='softmax')
        ])

        # 编译模型
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='categorical_crossentropy',
            metrics=['accuracy',
                     keras.metrics.Precision(name='precision'),
                     keras.metrics.Recall(name='recall')]
        )

        model.summary()
        return model

    def build_advanced_cnn(self):
        """构建高级CNN模型（更高准确率）"""
        print("构建高级CNN模型...")

        model = models.Sequential([
            # 输入层
            layers.Input(shape=self.input_shape),

            # 数据增强层
            layers.RandomFlip("horizontal"),
            layers.RandomRotation(0.1),
            layers.RandomZoom(0.1),
            layers.RandomBrightness(0.2),

            # 第一卷积块
            layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.MaxPooling2D((2, 2)),
            layers.Dropout(0.25),

            # 第二卷积块
            layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.MaxPooling2D((2, 2)),
            layers.Dropout(0.25),

            # 第三卷积块
            layers.Conv2D(256, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv2D(256, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.MaxPooling2D((2, 2)),
            layers.Dropout(0.25),

            # 第四卷积块
            layers.Conv2D(512, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.Conv2D(512, (3, 3), activation='relu', padding='same'),
            layers.BatchNormalization(),
            layers.MaxPooling2D((2, 2)),
            layers.Dropout(0.25),

            # 全局池化层
            layers.GlobalAveragePooling2D(),

            # 全连接层
            layers.Dense(1024, activation='relu'),
            layers.BatchNormalization(),
            layers.Dropout(0.5),

            layers.Dense(512, activation='relu'),
            layers.BatchNormalization(),
            layers.Dropout(0.5),

            # 输出层
            layers.Dense(self.num_classes, activation='softmax')
        ])

        # 编译模型
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='categorical_crossentropy',
            metrics=['accuracy',
                     keras.metrics.Precision(name='precision'),
                     keras.metrics.Recall(name='recall')]
        )

        model.summary()
        return model

    def build_resnet_like(self):
        """构建类ResNet模型"""
        print("构建类ResNet模型...")

        inputs = keras.Input(shape=self.input_shape)

        # 初始卷积层
        x = layers.Conv2D(64, (7, 7), padding='same')(inputs)
        x = layers.BatchNormalization()(x)
        x = layers.Activation('relu')(x)
        x = layers.MaxPooling2D((3, 3), strides=2, padding='same')(x)

        # 残差块1
        for _ in range(2):
            shortcut = x
            x = layers.Conv2D(64, (3, 3), padding='same')(x)
            x = layers.BatchNormalization()(x)
            x = layers.Activation('relu')(x)
            x = layers.Conv2D(64, (3, 3), padding='same')(x)
            x = layers.BatchNormalization()(x)
            x = layers.add([x, shortcut])
            x = layers.Activation('relu')(x)

        # 残差块2
        shortcut = layers.Conv2D(128, (1, 1), strides=2)(x)
        x = layers.Conv2D(128, (3, 3), strides=2, padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.Activation('relu')(x)
        x = layers.Conv2D(128, (3, 3), padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.add([x, shortcut])
        x = layers.Activation('relu')(x)

        for _ in range(1):
            shortcut = x
            x = layers.Conv2D(128, (3, 3), padding='same')(x)
            x = layers.BatchNormalization()(x)
            x = layers.Activation('relu')(x)
            x = layers.Conv2D(128, (3, 3), padding='same')(x)
            x = layers.BatchNormalization()(x)
            x = layers.add([x, shortcut])
            x = layers.Activation('relu')(x)

        # 全局池化和输出
        x = layers.GlobalAveragePooling2D()(x)
        x = layers.Dropout(0.5)(x)
        x = layers.Dense(256, activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.5)(x)
        outputs = layers.Dense(self.num_classes, activation='softmax')(x)

        model = keras.Model(inputs=inputs, outputs=outputs)

        # 编译模型
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )

        model.summary()
        return model

    def focal_loss(self, gamma=2., alpha=0.25):
        """
        Focal Loss for addressing class imbalance
        """

        def focal_loss_fixed(y_true, y_pred):
            epsilon = tf.keras.backend.epsilon()
            y_pred = tf.clip_by_value(y_pred, epsilon, 1. - epsilon)
            pt = tf.where(tf.equal(y_true, 1), y_pred, 1 - y_pred)
            pt = tf.keras.backend.clip(pt, epsilon, 1. - epsilon)
            return -tf.keras.backend.mean(alpha * tf.keras.backend.pow(1. - pt, gamma) * tf.keras.backend.log(pt))

        return focal_loss_fixed

    # 修改 create_enhanced_callbacks 方法，移除 TensorBoard 回调中的 write_images 和 profile_batch
    def create_enhanced_callbacks(self):
        """创建增强版训练回调函数"""
        # 使用时间戳创建唯一目录名
        timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        log_dir = f'./logs/{timestamp}'

        # 确保logs目录存在且是目录
        if os.path.exists('./logs'):
            if os.path.isfile('./logs') or os.path.islink('./logs'):
                try:
                    os.remove('./logs')
                except Exception as e:
                    print(f"警告: 无法删除 ./logs: {e}")

        os.makedirs('./logs', exist_ok=True)

        # 如果特定时间戳的目录已存在，使用递增计数器
        counter = 0
        original_log_dir = log_dir
        while os.path.exists(log_dir):
            if os.path.isfile(log_dir):
                try:
                    os.remove(log_dir)
                    break
                except Exception as e:
                    counter += 1
                    log_dir = f"{original_log_dir}_{counter}"
            else:
                import shutil
                try:
                    shutil.rmtree(log_dir)
                    break
                except Exception as e:
                    counter += 1
                    log_dir = f"{original_log_dir}_{counter}"

        os.makedirs(log_dir, exist_ok=True)

        callbacks_list = [
            # 改进的早停机制
            callbacks.EarlyStopping(
                monitor='val_accuracy',
                patience=30,
                restore_best_weights=True,
                verbose=1,
                min_delta=0.001
            ),

            # 学习率调整
            callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.2,
                patience=10,
                min_lr=1e-7,
                verbose=1
            ),

            # 模型检查点 - 使用新的 .keras 格式
            callbacks.ModelCheckpoint(
                filepath='best_emotion_model.keras',  # 使用 .keras 格式
                monitor='val_accuracy',
                save_best_only=True,
                mode='max',
                verbose=1,
                save_format='keras'  # 明确指定保存格式
            ),

            # TensorBoard日志 - 简化配置
            callbacks.TensorBoard(
                log_dir=log_dir,
                histogram_freq=0,  # 设置为0，避免直方图计算
                write_graph=True,
                write_images=False,  # 禁用图片写入
                update_freq='epoch',
                profile_batch=0  # 禁用性能分析
            ),

            # CSV日志
            callbacks.CSVLogger('training_log.csv')
        ]

        return callbacks_list

    # 修改 progressive_training 方法，简化回调处理
    def progressive_training(self, model, train_generator, val_generator,
                             steps_per_epoch, validation_steps, epochs=100):
        """渐进式训练策略"""
        print(f"\n开始渐进式训练模型...")
        print(f"训练参数: epochs={epochs}, batch_size={train_generator.batch_size}")

        # 第一阶段：冻结部分层进行预训练
        print("第一阶段训练：基础特征提取")
        for layer in model.layers[:-6]:  # 冻结前面的层
            layer.trainable = False

        # 创建第一阶段回调 - 简化版本
        stage1_callbacks = [
            callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.2,
                patience=5,
                min_lr=1e-7,
                verbose=1
            ),
            callbacks.ModelCheckpoint(
                filepath='stage1_best_model.keras',
                monitor='val_accuracy',
                save_best_only=True,
                mode='max',
                verbose=1,
                save_format='keras'
            ),
        ]

        history1 = model.fit(
            train_generator,
            steps_per_epoch=steps_per_epoch,
            epochs=min(20, epochs // 4),
            validation_data=val_generator,
            validation_steps=validation_steps,
            callbacks=stage1_callbacks,
            verbose=1
        )

        # 第二阶段：解冻所有层进行微调
        print("第二阶段训练：整体微调")
        for layer in model.layers:
            layer.trainable = True

        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.0001),
            loss='categorical_crossentropy',
            metrics=['accuracy',
                     keras.metrics.Precision(name='precision'),
                     keras.metrics.Recall(name='recall')]
        )

        # 创建第二阶段回调 - 完整的增强回调
        callbacks_list = self.create_enhanced_callbacks()

        history2 = model.fit(
            train_generator,
            steps_per_epoch=steps_per_epoch,
            epochs=max(epochs - min(20, epochs // 4), 1),  # 确保至少1个epoch
            validation_data=val_generator,
            validation_steps=validation_steps,
            callbacks=callbacks_list,
            verbose=1
        )

        # 合并训练历史
        combined_history = {}
        for key in history1.history:
            combined_history[key] = history1.history[key] + history2.history.get(key, [])

        return combined_history

    def train_model(self, model, train_generator, val_generator,
                    steps_per_epoch, validation_steps, epochs=100, use_focal_loss=False):
        """训练模型"""
        # ... 其他代码保持不变 ...

        # 创建回调函数
        callbacks_list = [
            callbacks.EarlyStopping(
                monitor='val_accuracy',
                patience=30,
                restore_best_weights=True,
                verbose=1,
                min_delta=0.001
            ),

            callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.2,
                patience=10,
                min_lr=1e-7,
                verbose=1
            ),

            # 使用 .keras 格式
            callbacks.ModelCheckpoint(
                filepath='best_emotion_model.keras',
                monitor='val_accuracy',
                save_best_only=True,
                mode='max',
                verbose=1,
                save_format='keras'
            ),

            callbacks.CSVLogger('training_log.csv')
        ]

        # ... 其他代码保持不变 ...

    def evaluate_model(self, model, X_test, y_test):
        """评估模型"""
        print("\n评估模型性能...")

        # 在测试集上评估
        results = model.evaluate(X_test, y_test, verbose=0)
        print(f"测试集损失: {results[0]:.4f}")
        print(f"测试集准确率: {results[1]:.4f}")

        if len(results) > 2:
            print(f"测试集精确率: {results[2]:.4f}")
            print(f"测试集召回率: {results[3]:.4f}")

        # 预测
        y_pred = model.predict(X_test, verbose=0)
        y_pred_classes = np.argmax(y_pred, axis=1)
        y_true_classes = np.argmax(y_test, axis=1)

        # 分类报告
        print("\n分类报告:")
        target_names = [self.emotion_labels[i] for i in range(self.num_classes)]
        print(classification_report(
            y_true_classes,
            y_pred_classes,
            target_names=target_names,
            digits=4
        ))

        # 混淆矩阵
        self.plot_confusion_matrix(y_true_classes, y_pred_classes)

        # 保存评估结果
        evaluation_results = {
            'test_loss': float(results[0]),
            'test_accuracy': float(results[1]),
            'classification_report': classification_report(
                y_true_classes, y_pred_classes,
                target_names=target_names,
                output_dict=True
            )
        }

        with open('evaluation_results.json', 'w') as f:
            json.dump(evaluation_results, f, indent=2)

        return results

    def plot_confusion_matrix(self, y_true, y_pred):
        """绘制混淆矩阵"""
        cm = confusion_matrix(y_true, y_pred)

        plt.figure(figsize=(10, 8))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                    xticklabels=[self.emotion_labels[i] for i in range(self.num_classes)],
                    yticklabels=[self.emotion_labels[i] for i in range(self.num_classes)])
        plt.title('Confusion Matrix', fontsize=16)
        plt.ylabel('True Label', fontsize=14)
        plt.xlabel('Predicted Label', fontsize=14)
        plt.tight_layout()
        plt.savefig('confusion_matrix.png', dpi=150, bbox_inches='tight')
        plt.show()

        # 计算每个类别的准确率
        class_accuracy = cm.diagonal() / cm.sum(axis=1)
        print("\n各类别准确率:")
        for i, acc in enumerate(class_accuracy):
            emotion_name = self.emotion_labels[i]
            print(f"  {emotion_name}: {acc:.3f}")

    def plot_training_history(self, history):
        """绘制训练历史"""
        fig, axes = plt.subplots(2, 2, figsize=(15, 10))

        # 准确率
        axes[0, 0].plot(history.history['accuracy'], label='Training Accuracy')
        axes[0, 0].plot(history.history['val_accuracy'], label='Validation Accuracy')
        axes[0, 0].set_title('Model Accuracy', fontsize=14)
        axes[0, 0].set_xlabel('Epoch')
        axes[0, 0].set_ylabel('Accuracy')
        axes[0, 0].legend()
        axes[0, 0].grid(True, alpha=0.3)

        # 损失
        axes[0, 1].plot(history.history['loss'], label='Training Loss')
        axes[0, 1].plot(history.history['val_loss'], label='Validation Loss')
        axes[0, 1].set_title('Model Loss', fontsize=14)
        axes[0, 1].set_xlabel('Epoch')
        axes[0, 1].set_ylabel('Loss')
        axes[0, 1].legend()
        axes[0, 1].grid(True, alpha=0.3)

        # 学习率
        if 'lr' in history.history:
            axes[1, 0].plot(history.history['lr'])
            axes[1, 0].set_title('Learning Rate', fontsize=14)
            axes[1, 0].set_xlabel('Epoch')
            axes[1, 0].set_ylabel('Learning Rate')
            axes[1, 0].grid(True, alpha=0.3)
            axes[1, 0].set_yscale('log')
        else:
            axes[1, 0].axis('off')

        # 最佳epoch标记
        best_epoch = np.argmax(history.history['val_accuracy'])
        best_acc = history.history['val_accuracy'][best_epoch]

        axes[1, 1].text(0.5, 0.5,
                        f'Best Validation Accuracy:\n{best_acc:.4f} at Epoch {best_epoch + 1}',
                        ha='center', va='center', fontsize=14,
                        bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
        axes[1, 1].axis('off')

        plt.suptitle('Training History', fontsize=16, y=1.02)
        plt.tight_layout()
        plt.savefig('training_history.png', dpi=150, bbox_inches='tight')
        plt.show()

    # 修改 save_final_model 方法，使用新的 .keras 格式
    def save_final_model(self, model, model_name='emotion_model_final.keras'):
        """保存最终模型"""
        # 保存为Keras格式（推荐）
        model.save(model_name)
        print(f"✓ 模型已保存为: {model_name}")

        # 也可以保存为H5格式（兼容性）
        h5_name = model_name.replace('.keras', '.h5')
        model.save(h5_name, save_format='h5')
        print(f"✓ 模型已保存为H5格式: {h5_name}")

        # 转换为TensorFlow SavedModel格式
        export_path = 'emotion_model_savedmodel'
        model.save(export_path, save_format='tf')
        print(f"✓ 模型已保存为SavedModel格式: {export_path}")

        # 保存标签映射
        label_mapping = {
            'emotion_labels': self.emotion_labels,
            'emotion_colors': self.emotion_colors
        }

        with open('label_mapping.json', 'w', encoding='utf-8') as f:
            json.dump(label_mapping, f, ensure_ascii=False, indent=2)
        print(f"✓ 标签映射已保存: label_mapping.json")


def main():
    """主训练函数"""
    print("=" * 60)
    print("FER2013 表情识别模型训练 - 优化版")
    print("=" * 60)

    # 初始化训练器
    trainer = EmotionModelTrainer()

    try:
        # 加载预处理数据
        X_train, y_train, X_val, y_val, X_test, y_test = trainer.load_preprocessed_data()
    except FileNotFoundError:
        print("预处理数据不存在，请先运行 prepare_fer2013.py")
        return

    # 创建数据生成器
    batch_size = 64
    train_generator, val_generator = trainer.create_enhanced_data_generators(
        X_train, y_train, X_val, y_val, batch_size
    )

    steps_per_epoch = len(X_train) // batch_size
    validation_steps = len(X_val) // batch_size

    # 选择模型类型
    print("\n选择模型架构:")
    print("1. 优化CNN (平衡速度与精度)")
    print("2. 高级CNN (高准确率)")
    print("3. 类ResNet (最高准确率)")
    print("4. 渐进式训练 (推荐)")

    choice = input("请输入选择 (1-4, 默认1): ").strip() or '1'

    if choice == '1':
        model = trainer.build_optimized_cnn()
        epochs = 50
    elif choice == '2':
        model = trainer.build_advanced_cnn()
        epochs = 80
    elif choice == '3':
        model = trainer.build_resnet_like()
        epochs = 100
    elif choice == '4':
        model = trainer.build_advanced_cnn()
        epochs = 100
        # 使用渐进式训练
        history = trainer.progressive_training(
            model, train_generator, val_generator,
            steps_per_epoch, validation_steps,
            epochs=epochs
        )
        trainer.plot_training_history(history)

        # 加载最佳模型
        if os.path.exists('best_emotion_model.h5'):
            print("\n加载最佳模型...")
            best_model = keras.models.load_model('best_emotion_model.h5')
        else:
            best_model = model

        # 评估模型
        trainer.evaluate_model(best_model, X_test, y_test)

        # 保存最终模型
        trainer.save_final_model(best_model)
        return
    else:
        model = trainer.build_optimized_cnn()
        epochs = 50

    # 是否使用Focal Loss
    use_focal = input("是否使用Focal Loss处理类别不平衡? (y/N, 默认N): ").strip().lower() == 'y'

    # 训练模型
    history = trainer.train_model(
        model, train_generator, val_generator,
        steps_per_epoch, validation_steps,
        epochs=epochs,
        use_focal_loss=use_focal
    )

    # 绘制训练历史
    trainer.plot_training_history(history)

    # 加载最佳模型
    if os.path.exists('best_emotion_model.keras'):
        print("\n加载最佳模型...")
        best_model = keras.models.load_model('best_emotion_model.keras')
    elif os.path.exists('best_emotion_model.h5'):
        print("\n加载最佳模型（H5格式）...")
        best_model = keras.models.load_model('best_emotion_model.h5')
    else:
        best_model = model

    # 评估模型
    trainer.evaluate_model(best_model, X_test, y_test)

    # 保存最终模型
    trainer.save_final_model(best_model)

    print("\n" + "=" * 60)
    print("训练完成！")
    print("已保存模型文件:")
    print("  - best_emotion_model.h5 (最佳验证准确率)")
    print("  - emotion_model_final.h5 (最终模型)")
    print("  - emotion_model_savedmodel/ (SavedModel格式)")
    print("  - label_mapping.json (标签映射)")
    print("=" * 60)


if __name__ == "__main__":
    main()
