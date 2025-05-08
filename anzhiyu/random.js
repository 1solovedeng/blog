var posts=["2025/04/20/实用工具-Dev-C++/","2025/05/07/力扣-1-两数之和（Two-Sum）/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };