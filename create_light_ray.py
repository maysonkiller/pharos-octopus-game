from PIL import Image, ImageDraw

width, height = 100, 300
img = Image.new('RGBA', (width, height), (0,0,0,0))
draw = ImageDraw.Draw(img)

for i in range(height):
    alpha = int(255 * (1 - i/height))  # плавное затухание
    color = (255, 255, 100, alpha)  # желтый с прозрачностью
    draw.line([(0, i), (width, i)], fill=color)

img.save('light-ray.png')
print("Сохранено light-ray.png")
