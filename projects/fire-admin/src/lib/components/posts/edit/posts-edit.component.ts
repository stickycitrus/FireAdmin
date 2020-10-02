import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { initTextEditor } from '../../../helpers/posts.helper';
import { I18nService } from '../../../services/i18n.service';
import { slugify } from '../../../helpers/functions.helper';
import { CategoriesService } from '../../../services/collections/categories.service';
import { Category } from '../../../models/collections/category.model';
import { Observable, Subscription, Subject } from 'rxjs';
import { map, take, takeUntil } from 'rxjs/operators';
import { AlertService } from '../../../services/alert.service';
import { PostsService } from '../../../services/collections/posts.service';
import { NavigationService } from '../../../services/navigation.service';
import { Post, PostStatus } from '../../../models/collections/post.model';
import { getEmptyImage } from '../../../helpers/assets.helper';
import { ActivatedRoute } from '@angular/router';
import {DndDropEvent, DropEffect} from "ngx-drag-drop";

@Component({
  selector: 'fa-posts-edit',
  templateUrl: './posts-edit.component.html',
  styleUrls: ['./posts-edit.component.css']
})
export class PostsEditComponent implements OnInit, AfterViewInit, OnDestroy {

  private id: string;
  title: string;
  price: string;
  editor: any;
  status: PostStatus;
  language: string;
  slug: string;
  date: string;
  private image: File;
  private images: File[] = [];
  imagesSources:  any[] = [];
  imageSrc: string|ArrayBuffer;
  checkedCategories: string[] = [];
  categoriesObservable: Observable<Category[]>;
  newCategory: string;
  isSubmitButtonsDisabled: boolean = false;
  allStatus: object|any = {};
  private subscription: Subscription = new Subscription();
  private routeParamsChange: Subject<void> = new Subject<void>();
  private galleryDeleteList: any[] = [];
  private draggable: any;
  private draggableListLeft: any;
  readonly horizontalLayout = {
    container: "row",
    list: "row",
    dndHorizontal: true
  };

  constructor(
    private i18n: I18nService,
    private categories: CategoriesService,
    private alert: AlertService,
    private posts: PostsService,
    public navigation: NavigationService,
    private route: ActivatedRoute
  ) {



    this.draggable = {
      // note that data is handled with JSON.stringify/JSON.parse
      // only set simple data or POJO's as methods will be lost
      data: "myDragData",
      effectAllowed: "all",
      disable: false,
      handle: false
    };

  }

  ngOnInit() {
    this.allStatus = this.posts.getAllStatus();
    this.isSubmitButtonsDisabled = true;
    this.subscription.add(
      this.route.params.subscribe((params: { id: string }) => {
        // console.log(params);
        this.posts.get(params.id).pipe(take(1)).toPromise().then((post: Post) => {
          // console.log(post);
          if (post) {
            this.id = post.id;
            this.title = post.title;
            this.price = post.price;
            this.editor.root.innerHTML = post.content;
            this.status = post.status;
            this.slug = post.slug;
            this.date = new Date(post.date).toISOString().slice(0, 10);
            this.language = post.lang;
            this.image = null;
            this.images = [];
            this.imageSrc = getEmptyImage();
            if (post.images) {
              post.images.forEach(i => {
                return this.posts.getImageUrl(i as string).pipe(take(1)).toPromise().then((imageUrl: string) => {
                  this.imagesSources.push({url: imageUrl, id: i});
                });
              });
            }
            this.checkedCategories = post.categories ? post.categories : [];
            this.routeParamsChange.next();
            this.setCategoriesObservable();
            this.isSubmitButtonsDisabled = false;
          } else {
            this.navigation.redirectTo('posts', 'list');
          }
        });
      })
    );
  }

  loadGallery() {
    this.posts.get(this.id).pipe(take(1)).toPromise().then((post: Post) => {
      // console.log(post);

        if (post.images.length > 0) {
          post.images.forEach(i => {
            return this.posts.getImageUrl(i as string).pipe(take(1)).toPromise().then((imageUrl: string) => {
              this.imagesSources.push({url: imageUrl, id: i});
            });
          });
        } else {
          this.imagesSources = []
          this.images = []
        }

    });
  }

  ngAfterViewInit() {
    this.editor = initTextEditor('#editor-container', this.i18n.get('PostContent'));
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.routeParamsChange.next();
  }

  private setCategoriesObservable() {
    this.categoriesObservable = this.categories.getWhere('lang', '==', this.language).pipe(
      map((categories: Category[]) => {
        return categories.sort((a: Category, b: Category) => b.createdAt - a.createdAt);
      }),
      takeUntil(this.routeParamsChange)
    );
  }

  onTitleInput() {
    this.slug = slugify(this.title).substr(0, 50);
  }

  addCategory(event: Event) {
    const target = event.target as any;
    target.disabled = true;
    this.categories.add({
      label: this.newCategory,
      slug: slugify(this.newCategory),
      lang: this.language
    }).catch((error: Error) => {
      this.alert.error(error.message);
    }).finally(() => {
      this.newCategory = '';
    });
  }

  onCategoryCheck(category: Category, event: Event|any) {
    if (event.target.checked) {
      this.checkedCategories.push(category.id);
    } else {
      const index = this.checkedCategories.indexOf(category.id);
      if (index !== -1) {
        this.checkedCategories.splice(index, 1);
      }
    }
  }

  onImageChange(event: Event) {
    this.image = (event.target as HTMLInputElement).files[0];
    const reader = new FileReader();
    reader.onload = () => {
      this.images.push(this.image);
      this.imagesSources.push({url: reader.result as string});
      this.imageSrc = reader.result;
    };
    reader.readAsDataURL(this.image);
  }

  onImageDelete(id) {
    this.galleryDeleteList.push(id);
    const index = this.imagesSources.findIndex(x => x.id == id);
    this.imagesSources.splice(index-1, 1);
    if (this.imagesSources.length == 0) {
      this.image = null;
      this.imageSrc = null;
      this.images = [];
    }
    //temp delete first and actually delete on save!
    //  this.posts.deleteImageFromGallery(this.id, id).then(() => {
    //    setTimeout(() => {this.loadGallery();}, 500);
    //  });
  }

  savePost(event: Event) {
    const target = event.target as any;
    const startLoading = () => {
      target.isLoading = true;
      this.isSubmitButtonsDisabled = true;
    };
    const stopLoading = () => {
      target.isLoading = false;
      this.isSubmitButtonsDisabled = false;
    };
    startLoading();
    // Check if post slug is duplicated
    this.posts.isSlugDuplicated(this.slug, this.language, this.id).then((duplicated: boolean) => {
      if (duplicated) {
        // Warn user about post slug
        this.alert.warning(this.i18n.get('PostSlugAlreadyExists'), false, 5000);
        stopLoading();
      } else {
        // Edit post
        const data: Post = {
          lang: this.language,
          title: this.title,
          price: this.price,
          slug: this.slug,
          date: new Date(this.date).getTime(),
          content: this.editor.root.innerHTML,
          status: this.status,
          categories: this.checkedCategories
        };
        if (this.images) {
          data.images = this.images;
        }

        this.galleryDeleteList.forEach(x => {
          this.posts.deleteImageFromGallery(this.id, x);
        });

        this.posts.edit(this.id, data, this.imagesSources).then(() => {
          this.alert.success(this.i18n.get('PostSaved'), false, 5000, true);
          this.navigation.redirectTo('posts', 'list');

        }).catch((error: Error) => {
          this.alert.error(error.message);
        }).finally(() => {
          stopLoading();
        });
      }
    }).catch((error: Error) => {
      this.alert.error(error.message);
      stopLoading();
    });
  }

  onDrop($event: DndDropEvent, list: any) {
    console.log($event);
    if( list
      && ($event.dropEffect === "copy"
        || $event.dropEffect === "move") ) {
      let index = $event.index;
      if( typeof index === "undefined" ) {
        index = list.length;
      }
      list.splice( index, 0, $event.data );
    }
  }


  onDragged( index:any, list:any[], effect:DropEffect ) {

    if( effect === "copy" ) {
      list.splice( index, 1 );
    }
  }

  onDragEnd($event: DragEvent) {

  }

  onDragStart($event: DragEvent) {

  }
}
