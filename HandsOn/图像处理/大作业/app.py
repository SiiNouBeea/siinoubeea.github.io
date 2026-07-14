from flask import Flask, render_template, request, jsonify, send_from_directory, url_for
from werkzeug.utils import secure_filename
import cv2
import numpy as np
import os
import time
from datetime import datetime
from model import emotion_model
from database import emotion_db
import ffmpeg
import threading
import uuid

app = Flask(__name__)

# 配置
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB限制
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['RESULT_FOLDER'] = 'static/results'
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'avi', 'mov'}

# 确保目录存在
for folder in [app.config['UPLOAD_FOLDER'], app.config['RESULT_FOLDER']]:
    os.makedirs(folder, exist_ok=True)


def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']


def process_image(file_path):
    """处理图像文件"""
    start_time = time.time()

    # 读取图像
    image = cv2.imread(file_path)
    if image is None:
        return None, "无法读取图像文件"

    # 识别表情
    results = emotion_model.predict_emotion(image)

    # 在图像上标注结果
    annotated_image = emotion_model.annotate_image(image, results)

    # 生成结果文件名
    result_filename = f"result_{int(time.time())}_{os.path.basename(file_path)}"
    result_path = os.path.join(app.config['RESULT_FOLDER'], result_filename)

    # 保存结果图像
    cv2.imwrite(result_path, annotated_image)

    processing_time = round(time.time() - start_time, 2)

    return {
        'results': results,
        'result_path': result_path,
        'processing_time': processing_time,
        'detection_count': len(results)
    }, None


def process_video(file_path):
    """处理视频文件（在后台线程中运行）"""

    def process():
        try:
            # 生成唯一ID用于跟踪处理状态
            task_id = str(uuid.uuid4())[:8]

            # 打开视频文件
            cap = cv2.VideoCapture(file_path)

            # 获取视频属性
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            # 准备输出视频
            result_filename = f"result_{task_id}_{os.path.basename(file_path)}"
            result_path = os.path.join(app.config['RESULT_FOLDER'], result_filename)

            # 使用H.264编码
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(result_path, fourcc, fps, (width, height))

            processed_frames = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                # 每隔N帧处理一次（为了性能）
                if processed_frames % 10 == 0:
                    results = emotion_model.predict_emotion(frame)
                    frame = emotion_model.annotate_image(frame, results)

                out.write(frame)
                processed_frames += 1

            # 释放资源
            cap.release()
            out.release()

            # 保存处理记录
            processing_time = round(time.time() - start_time, 2)
            emotion_db.save_video_result(
                os.path.basename(file_path),
                file_path,
                result_path,
                processed_frames,
                processing_time
            )

        except Exception as e:
            print(f"视频处理错误: {e}")

    # 在后台线程中处理视频
    start_time = time.time()
    thread = threading.Thread(target=process)
    thread.daemon = True
    thread.start()

    return {
        'message': '视频处理已开始，请稍后查看结果',
        'status': 'processing'
    }


@app.route('/')
def index():
    """渲染主页面"""
    # 获取最近的图像记录
    recent_images = emotion_db.get_recent_images(5)

    # 获取情绪统计
    emotion_stats = emotion_db.get_emotion_stats(7)

    return render_template('index.html',
                           recent_images=recent_images,
                           emotion_stats=emotion_stats)


@app.route('/upload', methods=['POST'])
def upload_file():
    """处理文件上传"""
    if 'file' not in request.files:
        return jsonify({'error': '没有文件部分'})

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': '没有选择文件'})

    # 检查文件扩展名是否允许
    if file and allowed_file(file.filename):  # 修复：直接使用 file.filename
        # 安全保存文件名
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{timestamp}_{filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(file_path)

        # 根据文件类型处理
        file_extension = filename.rsplit('.', 1)[1].lower()

        if file_extension in {'mp4', 'avi', 'mov'}:
            # 处理视频
            result = process_video(file_path)
            return jsonify(result)
        else:
            # 处理图像
            result, error = process_image(file_path)

            if error:
                return jsonify({'error': error})

            # 保存到数据库
            image_id = emotion_db.save_image_result(
                filename,
                file_path,
                result['result_path'],
                result['results'],
                result['processing_time']
            )

            # 获取相对路径用于前端显示
            result_url = url_for('static', filename=result['result_path'].replace('static/', ''))

            return jsonify({
                'success': True,
                'image_id': image_id,
                'result_url': result_url,
                'detections': result['results'],
                'detection_count': result['detection_count'],
                'processing_time': result['processing_time']
            })

    return jsonify({'error': '不支持的文件类型'})


@app.route('/realtime')
def realtime():
    """实时摄像头表情识别页面"""
    return render_template('realtime.html')


@app.route('/api/detect', methods=['POST'])
def detect_from_data():
    """从Base64数据检测表情"""
    try:
        data = request.json
        image_data = data.get('image')

        if not image_data:
            return jsonify({'error': '没有图像数据'})

        # 解码Base64图像
        import base64
        image_bytes = base64.b64decode(image_data.split(',')[1])
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 识别表情
        results = emotion_model.predict_emotion(image)

        return jsonify({
            'success': True,
            'detections': results,
            'detection_count': len(results)
        })

    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/api/statistics')
def get_statistics():
    """获取统计数据"""
    stats = emotion_db.get_emotion_stats(30)

    # 格式化数据用于图表
    emotions = [stat['emotion'] for stat in stats]
    counts = [stat['total_count'] for stat in stats]

    return jsonify({
        'emotions': emotions,
        'counts': counts,
        'total': sum(counts)
    })


@app.route('/api/history')
def get_history():
    """获取历史记录"""
    limit = request.args.get('limit', 10, type=int)
    recent_images = emotion_db.get_recent_images(limit)

    # 转换路径为URL
    for img in recent_images:
        if img['result_path']:
            img['result_url'] = url_for('static',
                                        filename=img['result_path'].replace('static/', ''))

    return jsonify(recent_images)


@app.route('/api/detection/<int:image_id>')
def get_detection_details(image_id):
    """获取检测详情"""
    details = emotion_db.get_detection_details(image_id)

    # 解析概率数据
    for detail in details:
        if detail['all_probabilities']:
            import json
            detail['probabilities'] = json.loads(detail['all_probabilities'])

    return jsonify(details)


@app.route('/test')
def test_page():
    """测试页面"""
    return render_template('test.html')


if __name__ == '__main__':
    # 检查模型是否加载成功
    print("=" * 50)
    print("人脸表情情绪识别系统")
    print("=" * 50)
    print("模型已加载，可以开始识别以下情绪：")
    for idx, label in emotion_model.emotion_labels.items():
        print(f"  {idx}. {label}")
    print("\n服务器启动中...")
    print(f"访问地址: http://127.0.0.1:5000")
    print("=" * 50)

    app.run(debug=True, host='0.0.0.0', port=5000)