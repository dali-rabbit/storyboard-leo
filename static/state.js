// state.js
window.AIImageState = (function () {
  let uploadedImageUrls = [];
  let uploadedLocalPaths = [];

  return {
    getUploadedUrls() {
      return [...uploadedImageUrls];
    },
    getLocalPaths() {
      return [...uploadedLocalPaths];
    },
    setUploadedUrls(urls) {
      uploadedImageUrls = [...urls];
    },
    setLocalPaths(paths) {
      uploadedLocalPaths = [...paths];
    },
    addUploadedFiles(urls, localPaths) {
      uploadedImageUrls.push(...urls);
      uploadedLocalPaths.push(...localPaths);
    },
    removeAtIndex(index) {
      uploadedImageUrls.splice(index, 1);
      uploadedLocalPaths.splice(index, 1);
    },
    swapIndices(i, j) {
      if (
        i < 0 ||
        j < 0 ||
        i >= uploadedImageUrls.length ||
        j >= uploadedImageUrls.length
      )
        return;
      [uploadedImageUrls[i], uploadedImageUrls[j]] = [
        uploadedImageUrls[j],
        uploadedImageUrls[i],
      ];
      [uploadedLocalPaths[i], uploadedLocalPaths[j]] = [
        uploadedLocalPaths[j],
        uploadedLocalPaths[i],
      ];
    },
    clear() {
      uploadedImageUrls = [];
      uploadedLocalPaths = [];
    },
    getCount() {
      return uploadedLocalPaths.length;
    },
    setFromUrls: function (urls, paths) {
      uploadedImageUrls = [...urls];
      uploadedLocalPaths = [...paths]; // mock 文件名
    },
  };
})();
