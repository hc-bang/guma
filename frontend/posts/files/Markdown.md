# 마크다운 가이드

> 이 문서는 마크다운(Markdown) 문법 사용법을 예제와 함께 제공합니다. 아래 예제를 복사하여 바로 사용하세요.

---

## 소개
마크다운은 가볍고 직관적인 텍스트 마크업 언어로, 간단한 문법으로 문서를 작성하고 HTML로 변환할 수 있습니다.

##### 참고 자료
- MarkLiveEdit: https://markdownlivepreview.dev

---

## 헤더(Header)
```markdown
# 제목 1
## 제목 2
### 제목 3
#### 제목 4
##### 제목 5
###### 제목 6
```

---

## 텍스트 서식
```markdown
**굵게 텍스트**  
*기울임 텍스트*  
~~취소선 텍스트~~  
```

---

## 목록(Lists)

### 순서 없는 목록
```markdown
- 항목 A
- 항목 B
  - 하위 항목 B1
  - 하위 항목 B2
* 또 다른 항목
```

### 순서 있는 목록
```markdown
1. 첫 번째
2. 두 번째
3. 세 번째
   1. 서브 항목 1
   2. 서브 항목 2
```

---

## 링크와 이미지(Links & Images)
```markdown
[링크 텍스트](https://example.com)  
![이미지 설명](https://example.com/image.png)  
```

---

## 코드(Code)

### 인라인 코드
```markdown
`console.log('Hello, Markdown!')`
```

### 코드 블록
<details>
<summary>```javascript 예제 보기</summary>

```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('World');
```
</details>

---

## 인용구(Blockquote)
```markdown
> 인용된 문장입니다.
> 
> 여러 줄 인용도 가능합니다.
```

---

## 표(Table)
```markdown
| 헤더1 | 헤더2 | 헤더3 |
|:-----:|:-----|------:|
| 가운데 | 왼쪽  |  오른쪽 |
|  예시1 | 예시2 | 예시3  |
```

---

## 수평선(Horizontal Rule)
```markdown
---
***
___
```

---

## 체크리스트(Task List)
```markdown
- [ ] 할 일 1
- [x] 완료된 할 일
- [ ] 할 일 2
```

---