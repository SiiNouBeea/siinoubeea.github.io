#!/usr/bin/env python3
"""
CNN 端到端脚本：胸部 X-ray 二分类
> python cnn_pneumonia.py
"""
import os, cv2, time, warnings, numpy as np
from tqdm import tqdm
import tensorflow as tf
from tensorflow.keras import layers, models

# 抑制日志
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
warnings.filterwarnings("ignore")

DATA_DIR = 'chest_xray'
IMG_SIZE = 128
CLASSES  = ['NORMAL', 'PNEUMONIA']

def load_dataset(subset='train'):
    """返回 (images, labels) 已缩放至 [0,1]"""
    path = os.path.join(DATA_DIR, subset)
    images, labels = [], []
    for lab, cls in enumerate(CLASSES):
        cls_path = os.path.join(path, cls)
        for fname in tqdm(os.listdir(cls_path), desc=f'{subset}/{cls}'):
            img = cv2.resize(cv2.imread(os.path.join(cls_path, fname)),
                             (IMG_SIZE, IMG_SIZE))
            images.append(img)
            labels.append(lab)
    return np.array(images, dtype='float32') / 255., np.array(labels)

def build_cnn():
    model = models.Sequential([
        layers.Conv2D(32, (3,3), activation='relu', input_shape=(IMG_SIZE, IMG_SIZE, 3)),
        layers.MaxPooling2D((2,2)),
        layers.Conv2D(64, (3,3), activation='relu'),
        layers.MaxPooling2D((2,2)),
        layers.Conv2D(64, (3,3), activation='relu'),
        layers.Flatten(),
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(1, activation='sigmoid')
    ])
    model.compile(optimizer='adam',
                  loss='binary_crossentropy',
                  metrics=['accuracy'])
    return model

def main():
    print('【CNN】加载数据...')
    X_train, y_train = load_dataset('train')
    X_val,   y_val   = load_dataset('val')
    X_test,  y_test  = load_dataset('test')

    model = build_cnn()
    print('【CNN】训练...')
    t0 = time.time()
    model.fit(X_train, y_train,
              epochs=5,
              batch_size=32,
              validation_data=(X_val, y_val),
              verbose=2)
    print(f'训练耗时: {time.time()-t0:.1f} s')

    print('【CNN】评估...')
    loss, acc = model.evaluate(X_test, y_test, verbose=0)
    print(f'Test accuracy: {acc:.3f}')

if __name__ == '__main__':
    main()