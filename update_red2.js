const fs = require('fs');
const path = require('path');

const booksPath = path.join(__dirname, 'src', 'data', 'classic-books.json');
const data = JSON.parse(fs.readFileSync(booksPath, 'utf8'));

const book = data.find(b => b.id === 'classic-redridinghood');
if (book) {
  book.pages[9].text = "사냥꾼 할아버지는 잠든 늑대의 배를\n가위로 조심조심 갈랐어요.\n\"휴, 살았다!\" 할머니와 빨간 모자가 쏙 빠져나왔지요.";
  fs.writeFileSync(booksPath, JSON.stringify(data, null, 2));
  console.log('Successfully updated red riding hood hunter scene');
}
