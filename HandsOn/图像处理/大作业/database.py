import sqlite3
import json
from datetime import datetime


class EmotionDatabase:
    def __init__(self, db_path='emotions.db'):
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        """初始化数据库表结构"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # 创建图像记录表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS image_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    original_path TEXT NOT NULL,
                    result_path TEXT NOT NULL,
                    detection_count INTEGER DEFAULT 0,
                    processing_time REAL,
                    upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # 创建人脸检测结果表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS face_detections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    image_id INTEGER,
                    face_index INTEGER,
                    x_position INTEGER,
                    y_position INTEGER,
                    width INTEGER,
                    height INTEGER,
                    emotion TEXT NOT NULL,
                    confidence REAL,
                    FOREIGN KEY (image_id) REFERENCES image_records (id)
                )
            ''')

            # 创建情绪统计表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS emotion_statistics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    emotion TEXT NOT NULL,
                    count INTEGER DEFAULT 0,
                    date DATE NOT NULL
                )
            ''')

            conn.commit()
            conn.close()
            print(f"✓ 数据库初始化完成: {self.db_path}")
        except Exception as e:
            print(f"⚠ 数据库初始化失败: {e}")

    def save_image_result(self, filename, original_path, result_path, detections, processing_time):
        """保存图像处理结果"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # 插入图像记录
            cursor.execute('''
                INSERT INTO image_records 
                (filename, original_path, result_path, detection_count, processing_time)
                VALUES (?, ?, ?, ?, ?)
            ''', (filename, original_path, result_path, len(detections), processing_time))

            image_id = cursor.lastrowid

            # 插入每个检测到的人脸
            for detection in detections:
                cursor.execute('''
                    INSERT INTO face_detections 
                    (image_id, face_index, x_position, y_position, width, height, 
                     emotion, confidence)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    image_id,
                    detection.get('id', 0),
                    detection['box']['x'],
                    detection['box']['y'],
                    detection['box']['width'],
                    detection['box']['height'],
                    detection['emotion'],
                    detection['confidence']
                ))

                # 更新情绪统计
                today = datetime.now().strftime('%Y-%m-%d')
                emotion = detection['emotion'].split('（')[0] if '（' in detection['emotion'] else detection['emotion']

                cursor.execute('''
                    INSERT OR IGNORE INTO emotion_statistics (emotion, date, count)
                    VALUES (?, ?, 0)
                ''', (emotion, today))

                cursor.execute('''
                    UPDATE emotion_statistics 
                    SET count = count + 1
                    WHERE emotion = ? AND date = ?
                ''', (emotion, today))

            conn.commit()
            conn.close()

            return image_id
        except Exception as e:
            print(f"保存图像结果时出错: {e}")
            return 0

    def get_recent_images(self, limit=10):
        """获取最近的图像记录"""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute('''
                SELECT * FROM image_records 
                ORDER BY upload_time DESC 
                LIMIT ?
            ''', (limit,))

            results = cursor.fetchall()
            conn.close()

            return [dict(row) for row in results]
        except Exception as e:
            print(f"获取最近图像时出错: {e}")
            return []

    def get_emotion_stats(self, days=7):
        """获取情绪统计"""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute('''
                SELECT emotion, SUM(count) as total_count
                FROM emotion_statistics
                WHERE date >= date('now', ?)
                GROUP BY emotion
                ORDER BY total_count DESC
            ''', (f'-{days} days',))

            results = cursor.fetchall()
            conn.close()

            return [dict(row) for row in results]
        except Exception as e:
            print(f"获取情绪统计时出错: {e}")
            return []


# 创建全局数据库实例
emotion_db = EmotionDatabase()