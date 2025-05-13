var posts=["2025/05/13/力扣-2-两数相加（Add-Two-Numbers）/","2025/05/13/声明-2025-5-13/","2025/05/07/力扣-1-两数之和（Two-Sum）/","2025/05/13/项目推荐-SDL太空战机射击游戏-SDLShooter/","2025/04/20/实用工具-Dev-C++/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };