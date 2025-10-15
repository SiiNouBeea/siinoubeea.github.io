# face_detection_gui.py
import cv2
import tkinter as tk
from tkinter import filedialog, messagebox
import os
import numpy as np

# ---------- 可调参数 ----------
HAAR_PATH = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
# ------------------------------

# 加载人脸检测器
face_cascade = cv2.CascadeClassifier(HAAR_PATH)


class FaceDetectionGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("人脸检测工具")
        self.root.geometry("400x200")

        # 创建界面元素
        self.create_widgets()

    def create_widgets(self):
        # 标题
        title_label = tk.Label(self.root, text="人脸检测工具", font=("Arial", 16))
        title_label.pack(pady=10)

        # 选择图片按钮
        select_btn = tk.Button(self.root, text="选择图片", command=self.select_image,
                               width=20, height=2, font=("Arial", 12))
        select_btn.pack(pady=10)

        # 保存图片复选框
        self.save_var = tk.BooleanVar()
        save_checkbox = tk.Checkbutton(self.root, text="保存检测结果到文件",
                                       variable=self.save_var, font=("Arial", 10))
        save_checkbox.pack(pady=5)

        # 状态标签
        self.status_label = tk.Label(self.root, text="请选择一张图片开始检测",
                                     font=("Arial", 10))
        self.status_label.pack(pady=10)

    def detect_and_draw_faces(self, image_path):
        """
        检测图片中的人脸并在人脸处绘制方框

        Args:
            image_path (str): 图片路径

        Returns:
            tuple: (带人脸框的图像, 检测到的人脸数量)
        """
        try:
            # 尝试使用cv2.imread直接读取
            img = cv2.imread(image_path)
            if img is None:
                # 如果直接读取失败，尝试使用numpy从文件读取
                with open(image_path, 'rb') as f:
                    file_bytes = np.asarray(bytearray(f.read()), dtype=np.uint8)
                    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

            if img is None:
                raise FileNotFoundError("图片读取失败，请检查路径")

            # 转换为灰度图
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            # 检测人脸
            faces = face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.2,
                minNeighbors=5,
                minSize=(30, 30)
            )

            # 在检测到的人脸周围绘制矩形框
            for (x, y, w, h) in faces:
                cv2.rectangle(img, (x, y), (x + w, y + h), (0, 255, 0), 2)
                # 添加标签
                cv2.putText(img, 'Face', (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

            return img, len(faces)

        except Exception as e:
            raise FileNotFoundError(f"图片读取失败: {str(e)}")

    def select_image(self):
        """选择图片文件并进行人脸检测"""
        # 打开文件选择对话框
        file_path = filedialog.askopenfilename(
            title="选择图片文件",
            filetypes=[
                ("Image files", "*.jpg *.jpeg *.png *.bmp *.tiff *.JPG *.JPEG *.PNG *.BMP *.TIFF"),
                ("All files", "*.*")
            ]
        )

        if not file_path:  # 用户取消选择
            return

        try:
            # 验证文件是否存在
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"文件不存在: {file_path}")

            # 验证文件是否可读
            if not os.access(file_path, os.R_OK):
                raise PermissionError(f"没有权限读取文件: {file_path}")

            # 更新状态
            self.status_label.config(text="正在检测人脸...")
            self.root.update()

            # 检测人脸
            result_img, face_count = self.detect_and_draw_faces(file_path)

            # 保存图片（如果勾选了保存选项）
            if self.save_var.get():
                # 设置输出路径
                directory = os.path.dirname(file_path)
                filename = os.path.basename(file_path)
                name, ext = os.path.splitext(filename)
                output_path = os.path.join(directory, f"detected_{name}{ext}")

                # 保存图像
                success = cv2.imwrite(output_path, result_img)
                if success:
                    save_info = f"\n结果已保存到: {output_path}"
                else:
                    save_info = "\n保存文件时出错"
            else:
                save_info = ""

            # 更新状态
            self.status_label.config(text=f"检测完成！找到 {face_count} 张人脸{save_info}")

            # 显示结果
            self.display_result(file_path, result_img, face_count)

        except FileNotFoundError as e:
            error_msg = f"文件错误: {str(e)}"
            messagebox.showerror("文件错误", error_msg)
            self.status_label.config(text=error_msg)
        except PermissionError as e:
            error_msg = f"权限错误: {str(e)}"
            messagebox.showerror("权限错误", error_msg)
            self.status_label.config(text=error_msg)
        except Exception as e:
            error_msg = f"处理图片时出错: {str(e)}"
            messagebox.showerror("错误", error_msg)
            self.status_label.config(text="请选择一张图片开始检测")

    def display_result(self, original_path, result_img, face_count):
        """
        显示检测结果

        Args:
            original_path (str): 原始图片路径
            result_img (numpy.ndarray): 检测后的图像
            face_count (int): 检测到的人脸数量
        """
        # 获取文件名用于窗口标题
        filename = os.path.basename(original_path)

        # 创建新窗口显示结果
        cv2.imshow(f'人脸检测结果 - {filename} (检测到 {face_count} 张人脸)', result_img)

        # 提示信息
        messagebox.showinfo("检测完成", f"检测完成！\n找到 {face_count} 张人脸\n\n按任意键关闭图像窗口")


def main():
    """主函数"""
    root = tk.Tk()
    app = FaceDetectionGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
