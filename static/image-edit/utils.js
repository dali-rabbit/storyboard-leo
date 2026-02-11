// image-edit/utils.js
// 工具函数

// 获取比例数值
function getAspectRatioValue(ratio) {
  const ratioMap = {
    "1:1": 1,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "2:3": 2 / 3,
    "3:2": 3 / 2,
  };
  return ratioMap[ratio] || 16 / 9;
}
