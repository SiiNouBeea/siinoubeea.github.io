import random
import math

# ---------- 功能 1：1/2/3/4 组成无重复三位数 ----------
def three_digits_1234():
    digits = [1, 2, 3, 4]
    res = []
    for a in digits:
        for b in digits:
            if b == a:
                continue
            for c in digits:
                if c == a or c == b:
                    continue
                res.append(a*100 + b*10 + c)
    print("【1】1/2/3/4 能组成的无重复三位数：")
    print(res)
    print("共 {} 个\n".format(len(res)))

# ---------- 功能 2：101-200 之间的素数 ----------
def primes_101_200():
    primes = []
    for n in range(101, 201):
        is_p = True
        for d in range(2, int(math.isqrt(n)) + 1):
            if n % d == 0:
                is_p = False
                break
        if is_p:
            primes.append(n)
    print("【2】101–200 之间的素数：")
    print(primes)
    print("共 {} 个\n".format(len(primes)))

# ---------- 功能 3：正整数分解质因数 ----------
def factorize():
    n = int(input("【3】请输入一个正整数："))
    print(f"{n}=", end="")
    tmp = n
    first = True
    for p in range(2, int(math.isqrt(n)) + 1):
        while tmp % p == 0:
            if not first:
                print("*", end="")
            print(p, end="")
            first = False
            tmp //= p
    if tmp > 1:
        if not first:
            print("*", end="")
        print(tmp, end="")
    print("\n")

# ---------- 功能 4：随机 30 整数，减均值 ----------
def random_minus_mean():
    data = [random.randint(0, 99) for _ in range(30)]
    mean = sum(data) / len(data)
    minus = [x - mean for x in data]
    print("【4】随机生成的 30 个整数：")
    print(data)
    print("均值 = {:.2f}".format(mean))
    print("每个元素减去均值后的列表：")
    print(minus)

if __name__ == "__main__":
    tmp = ''
    tmp = input(''' 2025/10/09 作业2 如下：
        1. 有四个数字：1、2、3、4，能组成多少个互不相同且无重复数字的三位数？各是多少？\n
        2.判断101-200之间有多少个素数，并输出所有素数。\n
        3.将一个正整数分解质因数。例如：输入90,打印出90=2*3*3*5。\n
        4.随机生成30个整数构成列表，并计算列表均值，然后利用列表中每个元素逐个减去均值。\n
输入题目选项(1-4,输入其它则退出):''')
    while(tmp in '1234'):
        if tmp == '1':
            print("\n\n1. 有四个数字：1、2、3、4，能组成多少个互不相同且无重复数字的三位数？各是多少？")
            three_digits_1234()
        if tmp == '2':
            print('\n\n2.判断101-200之间有多少个素数，并输出所有素数。')
            primes_101_200()
        if tmp == '3':
            print('\n\n3.将一个正整数分解质因数。例如：输入90,打印出90=2*3*3*5。')
            factorize()
        if tmp == '4':
            print('\n\n4.随机生成30个整数构成列表，并计算列表均值，然后利用列表中每个元素逐个减去均值。')
            random_minus_mean()
        tmp = input(''' 2025/10/09 作业2 如下：
                1.有四个数字：1、2、3、4，能组成多少个互不相同且无重复数字的三位数？各是多少？\n
                2.判断101-200之间有多少个素数，并输出所有素数。\n
                3.将一个正整数分解质因数。例如：输入90,打印出90=2*3*3*5。\n
                4.随机生成30个整数构成列表，并计算列表均值，然后利用列表中每个元素逐个减去均值。\n
        输入题目选项(1-4,输入其它则退出):''')
    print('\n\n============= over =============')